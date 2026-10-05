// npx tsx medicao/whisperx.ts [--video arquivo.mp4] [--vezes 2]
//
// Mede o WhisperX no Replicate (a transcrição padrão, src/motor/whisperx.ts, na
// versão fixada): envia o áudio do vídeo de teste e salva os tempos por palavra em
// medicao/resultados/<vídeo>.whisperx.json, no formato das outras transcrições da
// medição, com o custo (tempo de processamento × preço do hardware), o tempo
// total e a espera até começar de cada execução. Com --vezes 2, roda de novo logo
// em seguida para ver o tempo a quente. Sem prazo (a medição quer o tempo real).
import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {carregarEnv} from "../src/motor/env";
import {HARDWARE_WHISPERX, MODELO_WHISPERX, PRECO_POR_SEGUNDO_WHISPERX, VERSAO_WHISPERX, transcreverWhisperX} from "../src/motor/whisperx";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SAIDA = path.join(RAIZ, "medicao", "resultados");
const VIDEO_DE_TESTE = "Maiara - Harmonização intima.mp4";

const argumento = (nome: string): string | undefined => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const principal = async () => {
  carregarEnv(RAIZ);
  mkdirSync(SAIDA, {recursive: true});
  const video = path.resolve(argumento("--video") ?? path.join(RAIZ, "removidos", VIDEO_DE_TESTE));
  const vezes = Number(argumento("--vezes") ?? 1);
  const base = path.basename(video, path.extname(video));
  console.log(`${MODELO_WHISPERX} versão ${VERSAO_WHISPERX.slice(0, 12)}… (fixada)`);

  const execucoes = [];
  let ultima: Awaited<ReturnType<typeof transcreverWhisperX>> | undefined;
  for (let vez = 1; vez <= vezes; vez++) {
    ultima = await transcreverWhisperX(video, {prazoMs: 10 * 60_000});
    const e = ultima.execucao;
    execucoes.push({vez, ...e, logs: undefined});
    console.log(
      `Execução ${vez}: envio do áudio ${e.envioDoAudioS.toFixed(1)} s · espera até começar ${e.esperaS.toFixed(1)} s · processamento ${e.processamentoS.toFixed(1)} s · total ${e.totalS.toFixed(1)} s · custo US$ ${e.custoUsd.toFixed(4)} (${HARDWARE_WHISPERX}, US$ ${PRECO_POR_SEGUNDO_WHISPERX}/s)`,
    );
  }
  const {words, semTempo, execucao} = ultima!;
  const destino = path.join(SAIDA, `${base}.whisperx.json`);
  writeFileSync(
    destino,
    JSON.stringify(
      {source: path.basename(video), model: `replicate/${MODELO_WHISPERX}@${VERSAO_WHISPERX}`, palavrasSemTempo: semTempo, execucoes, words, logs: execucao.logs},
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
