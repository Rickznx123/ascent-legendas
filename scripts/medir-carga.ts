// npx tsx scripts/medir-carga.ts <video.mp4> [simultâneos...]
// Mede o que um envio custa no servidor, com N envios ao mesmo tempo: as mesmas
// etapas e funções do servidor, com o S3 e o WhisperX simulados (nada é pago):
//   conferir   ffprobe do arquivo (POST /api/envio/concluir)
//   prévia     capa e cópia leve em H.264 (previa-leve.ts, com a fila dela)
//   transcrição áudio WAV + detecção de voz + MP3 do WhisperX (resposta simulada)
//   sons       os "sons tocados" que a prévia do editor pede (GET /sons/...)
// Mostra o pico de memória (Node + ffmpeg) e o atraso do Node (o que uma rota de
// saúde sentiria). Para simular 1 CPU no Windows, rode com afinidade de 1 núcleo
// (vale também para os ffmpeg, que herdam):
//   cmd /c "start /affinity 1 /wait /b node --import tsx scripts/medir-carga.ts video.mp4 2 4 8"
// Com 1 núcleo, a própria amostragem de memória perde a vez e subestima o pico:
// meça a memória por fora (Get-Process ffmpeg, node a cada 0,5 s).
import {execFile} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {monitorEventLoopDelay} from "node:perf_hooks";
import type {Readable} from "node:stream";
import {promisify} from "node:util";
import {filaComVagas, LIMITES_DE_USO} from "../app/servidor/limites";
import {previasLeves} from "../app/servidor/previa-leve";
import type {ArmazenamentoS3} from "../app/servidor/s3";
import {execFileAsync, ffmpegPath, getVideoMetadata} from "../src/motor/ferramentas";
import {somTocadoEmCache} from "../src/motor/pasta-sons";
import {extrairAudioParaTranscrever} from "../src/motor/transcricao";
import {detectarVozDoVideo} from "../src/motor/voz";

const [video, ...pedidos] = process.argv.slice(2);
if (!video) throw new Error("Uso: npx tsx scripts/medir-carga.ts <video.mp4> [simultâneos...]");
const SIMULTANEOS = pedidos.length > 0 ? pedidos.map(Number) : [1, 2, 4, 8];
// Tempo de resposta simulado do WhisperX no Replicate.
const REPLICATE_MS = 15_000;
// Sons diferentes que a prévia do editor pede ao abrir um vídeo.
const SONS_POR_EDITOR = 15;
const RAIZ = process.cwd();
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Memória dos ffmpeg/ffprobe abertos agora (MB), pelo tasklist (Windows) ou ps.
const memoriaDosFilhos = async (): Promise<number> => {
  if (process.platform === "win32") {
    const {stdout} = await promisify(execFile)("tasklist", ["/fo", "csv", "/nh"]);
    return stdout
      .split("\n")
      .filter((linha) => /^"(ffmpeg|ffprobe)\.exe"/iu.test(linha))
      .reduce((soma, linha) => soma + Number(linha.split('","')[4]?.replace(/\D/gu, "") ?? 0) / 1024, 0);
  }
  const {stdout} = await promisify(execFile)("ps", ["-C", "ffmpeg,ffprobe", "-o", "rss="]).catch(() => ({stdout: ""}));
  return stdout.split("\n").reduce((soma, linha) => soma + (Number(linha.trim()) || 0) / 1024, 0);
};

// S3 de mentira: lê o que seria enviado e avisa quando a prévia (.mp4) chega.
const prontas = new Map<string, () => void>();
const armazenamento = {
  bucket: "teste",
  enderecoDeLeitura: async () => video,
  s3: {
    send: async (comando: {input: {Key?: string; Body?: Readable}}) => {
      const {Key = "", Body} = comando.input;
      if (Body) for await (const _ of Body);
      if (Key.endsWith(".mp4")) prontas.get(Key.split("/").pop()!.replace(/\.mp4$/u, ""))?.();
      return {};
    },
  },
} as unknown as ArmazenamentoS3;
const previas = previasLeves(armazenamento);
const filaDeTranscricoes = filaComVagas(LIMITES_DE_USO.transcricoesAoMesmoTempo);
// Como a rota GET /sons/*: no máximo FILA_SONS ffmpeg de sons ao mesmo tempo.
const filaDeSons = filaComVagas(LIMITES_DE_USO.sonsAoMesmoTempo);

const medirEnvio = async (n: number, rodada: number) => {
  const tempos: Record<string, number> = {};
  const etapa = async <T>(nome: string, fn: () => Promise<T>): Promise<T> => {
    const inicio = Date.now();
    try {
      return await fn();
    } finally {
      tempos[nome] = (Date.now() - inicio) / 1000;
    }
  };
  const nome = `r${rodada}-e${n}`;
  await etapa("conferir", () => getVideoMetadata(video));
  const previa = etapa("previa", () => new Promise<void>((resolve) => {
    prontas.set(nome, resolve);
    previas.gerar("teste", `${nome}`);
  }));
  const transcricao = etapa("transcricao", async () => {
    const liberar = await filaDeTranscricoes.entrar();
    try {
      const {audio, apagar} = await extrairAudioParaTranscrever(video);
      try {
        const voz = detectarVozDoVideo(audio);
        const pasta = mkdtempSync(path.join(os.tmpdir(), "carga-mp3-"));
        try {
          const mp3 = path.join(pasta, "audio.mp3");
          await execFileAsync(ffmpegPath(), ["-y", "-i", audio, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", mp3]);
          readFileSync(mp3);
        } finally {
          rmSync(pasta, {recursive: true, force: true});
        }
        await Promise.all([voz, esperar(REPLICATE_MS)]);
      } finally {
        await apagar();
      }
    } finally {
      liberar();
    }
  });
  await transcricao;
  // Abre o editor: a prévia pede os sons tocados todos de uma vez.
  const cache = mkdtempSync(path.join(os.tmpdir(), "carga-sons-"));
  try {
    await etapa("sons", () =>
      Promise.all(
        Array.from({length: SONS_POR_EDITOR}, (_, i) =>
          filaDeSons.entrar().then((liberar) =>
            somTocadoEmCache(RAIZ, `tocados/linear/typing-${(i % 4) + 1}.wav-${20 + i}q-30fps-fade0-folga33.wav`, cache).finally(liberar),
          ),
        ),
      ),
    );
  } finally {
    rmSync(cache, {recursive: true, force: true});
  }
  await previa;
  return tempos;
};

for (const [rodada, n] of SIMULTANEOS.entries()) {
  let picoNode = 0;
  let picoTotal = 0;
  let medindo = true;
  const atraso = monitorEventLoopDelay({resolution: 20});
  atraso.enable();
  const amostrar = (async () => {
    while (medindo) {
      const node = process.memoryUsage().rss / 1024 / 1024;
      const filhos = await memoriaDosFilhos();
      picoNode = Math.max(picoNode, node);
      picoTotal = Math.max(picoTotal, node + filhos);
      await esperar(250);
    }
  })();
  const inicio = Date.now();
  const resultados = await Promise.all(Array.from({length: n}, (_, i) => medirEnvio(i, rodada)));
  const totalS = (Date.now() - inicio) / 1000;
  medindo = false;
  await amostrar;
  atraso.disable();
  const maior = (campo: string) => Math.max(...resultados.map((r) => r[campo])).toFixed(1);
  const linha =
    `${n} simultâneos: pico ${picoTotal.toFixed(0)} MB (Node ${picoNode.toFixed(0)} MB), total ${totalS.toFixed(0)} s | ` +
    `pior envio: conferir ${maior("conferir")} s, transcrição ${maior("transcricao")} s, sons ${maior("sons")} s, prévia ${maior("previa")} s | ` +
    `atraso do Node: máx ${(atraso.max / 1e6).toFixed(0)} ms, p99 ${(atraso.percentile(99) / 1e6).toFixed(0)} ms`;
  console.log(linha);
}
