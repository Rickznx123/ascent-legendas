// npx tsx medicao/whisperx.ts [--video arquivo.mp4] [--vezes 2]
//
// Teste de alinhamento forçado com o WhisperX no Replicate (victor-upmeet/whisperx):
// envia o áudio do vídeo de teste, pede a transcrição em português com
// alinhamento por palavra (align_output) e salva os tempos de cada palavra em
// medicao/resultados/<vídeo>.whisperx.json, no formato das outras transcrições da
// medição. Mede o custo (tempo de processamento × preço do hardware), o tempo
// total e a espera de partida a frio; com --vezes 2, roda de novo logo em seguida
// para ver o tempo a quente. Só teste: não muda nada no app.
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileAsync, ffmpegPath} from "../src/motor/ferramentas";
import type {Word} from "../src/types";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SAIDA = path.join(RAIZ, "medicao", "resultados");
const MODELO = "victor-upmeet/whisperx";
// Hardware do modelo (página do modelo) e preço por segundo (replicate.com/pricing,
// consultado em 2026-10-05). Modelos públicos cobram só o tempo de processamento.
const HARDWARE = "Nvidia A100 (80GB)";
const PRECO_POR_SEGUNDO = 0.0014;
const VIDEO_DE_TESTE = "Maiara - Harmonização intima.mp4";

const argumento = (nome: string): string | undefined => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

if (existsSync(path.join(RAIZ, ".env"))) {
  process.loadEnvFile(path.join(RAIZ, ".env"));
}
const token = process.env.REPLICATE_API_TOKEN?.trim();
if (!token) {
  throw new Error("Falta REPLICATE_API_TOKEN no .env.");
}
const api = async <T>(caminho: string, init: RequestInit = {}): Promise<T> => {
  let resposta: Response;
  // Conta com pouco crédito: 1 criação por vez (429 com retry_after). Espera e tenta de novo.
  for (let tentativa = 1; ; tentativa++) {
    resposta = await fetch(`https://api.replicate.com/v1${caminho}`, {
      ...init,
      headers: {Authorization: `Bearer ${token}`, ...(init.headers ?? {})},
    });
    if (resposta.status !== 429 || tentativa >= 10) {
      break;
    }
    const espera = Number((await resposta.json().catch(() => ({}))).retry_after ?? 2);
    await new Promise((r) => setTimeout(r, (espera + 1) * 1000));
  }
  if (!resposta.ok) {
    throw new Error(`Replicate respondeu ${resposta.status} em ${caminho}: ${(await resposta.text()).slice(0, 300)}`);
  }
  return (await resposta.json()) as T;
};

type Schema = {components: {schemas: {Input: {properties: Record<string, unknown>}}}};
type Previsao = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  logs?: string;
  metrics?: {predict_time?: number; total_time?: number};
  output?: {segments: {start: number; end: number; text: string; words?: {word: string; start?: number; end?: number; score?: number}[]}[]; detected_language: string};
};

// Lê o schema da versão atual antes de chamar: os campos usados precisam existir.
const versaoAtual = async (): Promise<string> => {
  const modelo = await api<{latest_version: {id: string; openapi_schema: Schema}}>(`/models/${MODELO}`);
  const campos = modelo.latest_version.openapi_schema.components.schemas.Input.properties;
  const usados = ["audio_file", "language", "align_output", "debug"];
  const faltando = usados.filter((campo) => !(campo in campos));
  if (faltando.length > 0) {
    throw new Error(`O schema do ${MODELO} não tem mais: ${faltando.join(", ")}.`);
  }
  return modelo.latest_version.id;
};

// Palavras com tempo. O WhisperX deixa sem tempo palavras que o alinhador não
// consegue casar (números, símbolos): elas ganham o espaço entre as vizinhas.
const palavrasDaSaida = (saida: NonNullable<Previsao["output"]>): {words: Word[]; semTempo: string[]} => {
  const brutas = saida.segments.flatMap((segmento) =>
    (segmento.words ?? []).map((w) => ({texto: w.word.trim(), start: w.start, end: w.end, segmento})),
  );
  const semTempo: string[] = [];
  const words: Word[] = brutas.map((w, i) => {
    if (w.start !== undefined && w.end !== undefined) {
      return {text: w.texto, startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000)};
    }
    semTempo.push(w.texto);
    const antes = brutas.slice(0, i).reverse().find((x) => x.end !== undefined);
    const depois = brutas.slice(i + 1).find((x) => x.start !== undefined);
    const de = (antes?.end ?? w.segmento.start) * 1000;
    const ate = (depois?.start ?? w.segmento.end) * 1000;
    return {text: w.texto, startMs: Math.round(de), endMs: Math.round(Math.max(de, ate))};
  });
  return {words: words.filter((w) => w.text), semTempo};
};

const segundos = (de?: string, ate?: string) => (de && ate ? (Date.parse(ate) - Date.parse(de)) / 1000 : undefined);

const principal = async () => {
  mkdirSync(SAIDA, {recursive: true});
  const video = path.resolve(argumento("--video") ?? path.join(RAIZ, "removidos", VIDEO_DE_TESTE));
  const vezes = Number(argumento("--vezes") ?? 1);
  const base = path.basename(video, path.extname(video));

  const versao = await versaoAtual();
  console.log(`${MODELO} versão ${versao.slice(0, 12)}… (schema conferido)`);

  // Áudio mono, 16 kHz (o WhisperX trabalha nessa taxa), MP3 de 64 kbps.
  const temp = mkdtempSync(path.join(os.tmpdir(), "whisperx-"));
  const audio = path.join(temp, "audio.mp3");
  await execFileAsync(ffmpegPath(), ["-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", audio]);
  const bytes = readFileSync(audio);
  rmSync(temp, {recursive: true, force: true});

  const execucoes = [];
  let ultima: Previsao | undefined;
  for (let vez = 1; vez <= vezes; vez++) {
    const inicio = Date.now();
    // O áudio vai pela API de arquivos (uma URL que só a conta enxerga).
    const form = new FormData();
    form.append("content", new Blob([bytes], {type: "audio/mpeg"}), `${base}.mp3`);
    const arquivo = await api<{id: string; urls: {get: string}}>("/files", {method: "POST", body: form});
    const envioMs = Date.now() - inicio;

    let previsao = await api<Previsao>("/predictions", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        version: versao,
        input: {audio_file: arquivo.urls.get, language: "pt", align_output: true, debug: true},
      }),
    });
    while (!["succeeded", "failed", "canceled"].includes(previsao.status)) {
      await new Promise((r) => setTimeout(r, 500));
      previsao = await api<Previsao>(`/predictions/${previsao.id}`);
    }
    const totalMs = Date.now() - inicio;
    await api(`/files/${arquivo.id}`, {method: "DELETE"}).catch(() => undefined);
    if (previsao.status !== "succeeded" || !previsao.output) {
      throw new Error(`A execução ${previsao.id} terminou como ${previsao.status}: ${previsao.error ?? ""}\n${previsao.logs ?? ""}`);
    }
    const processamento = previsao.metrics?.predict_time ?? 0;
    const execucao = {
      vez,
      id: previsao.id,
      envioDoAudioS: envioMs / 1000,
      // Da criação ao início do processamento: fila e partida a frio do modelo.
      esperaS: segundos(previsao.created_at, previsao.started_at),
      processamentoS: processamento,
      totalS: totalMs / 1000,
      custoUsd: processamento * PRECO_POR_SEGUNDO,
      partidaAFrio: /cold|setup|boot/iu.test(previsao.logs ?? "") || (segundos(previsao.created_at, previsao.started_at) ?? 0) > 10,
    };
    execucoes.push(execucao);
    console.log(
      `Execução ${vez}: envio do áudio ${execucao.envioDoAudioS.toFixed(1)} s · espera até começar ${execucao.esperaS?.toFixed(1)} s · processamento ${processamento.toFixed(1)} s · total ${execucao.totalS.toFixed(1)} s · custo US$ ${execucao.custoUsd.toFixed(4)} (${HARDWARE}, US$ ${PRECO_POR_SEGUNDO}/s)`,
    );
    ultima = previsao;
  }

  const {words, semTempo} = palavrasDaSaida(ultima!.output!);
  const destino = path.join(SAIDA, `${base}.whisperx.json`);
  writeFileSync(
    destino,
    JSON.stringify(
      {
        source: path.basename(video),
        model: `replicate/${MODELO}@${versao}`,
        idioma: ultima!.output!.detected_language,
        palavrasSemTempo: semTempo,
        execucoes,
        words,
        logs: ultima!.logs,
        segments: ultima!.output!.segments,
      },
      null,
      2,
    ),
  );
  console.log(`${words.length} palavras (${semTempo.length} sem tempo do alinhador${semTempo.length ? `: ${semTempo.join(", ")}` : ""}). Salvo em ${destino}`);
};

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
