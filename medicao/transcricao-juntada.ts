// npx tsx medicao/transcricao-juntada.ts <pasta-com-os-takes-convertidos> <saida.json>
// Medição (plano dos takes): junta o áudio de 10 trechos de 5 takes num arquivo só
// (fade de 15 ms em cada ponta, para não estalar), transcreve uma vez no WhisperX e
// devolve cada palavra para o take e o tempo de origem. Confere a volta com as
// palavras do transcricao.json (o take 1 é a Mechas).
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {carregarEnv} from "../src/motor/env";
import {execFileAsync, ffmpegPath} from "../src/motor/ferramentas";
import {transcreverWhisperX} from "../src/motor/whisperx";
import type {Word} from "../src/types";

const RAIZ = path.resolve(import.meta.dirname, "..");
carregarEnv(RAIZ);
const [pasta, saida] = process.argv.slice(2);
const takes = readdirSync(pasta).filter((nome) => nome.endsWith(".mp4")).sort();
const FADE_S = 0.015;
// 2 trechos de 4 s por take (o take 4 tem 9,7 s), na ordem dos takes.
const JANELAS: [number, number][][] = [
  [[2, 6], [20, 24]],
  [[3, 7], [15, 19]],
  [[5, 9], [30, 34]],
  [[1, 5], [5.5, 9.5]],
  [[4, 8], [25, 29]],
];
const trechos = takes.flatMap((take, i) => JANELAS[i].map(([de, ate]) => ({take, deS: de, ateS: ate})));

const temp = mkdtempSync(path.join(os.tmpdir(), "legendas-juntada-"));
try {
  const audio = path.join(temp, "juntado.wav");
  const filtros = trechos.map(
    ({deS, ateS}, i) =>
      `[${i}:a]atrim=${deS}:${ateS},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE_S},afade=t=out:st=${(ateS - deS - FADE_S).toFixed(3)}:d=${FADE_S}[a${i}]`,
  );
  const inicioDoAudio = Date.now();
  await execFileAsync(ffmpegPath(), [
    "-v", "error", "-y",
    ...trechos.flatMap(({take}) => ["-i", path.join(pasta, take)]),
    "-filter_complex", `${filtros.join(";")};${trechos.map((_, i) => `[a${i}]`).join("")}concat=n=${trechos.length}:v=0:a=1[a]`,
    "-map", "[a]", "-ac", "1", "-ar", "16000", audio,
  ]);
  const juntarS = (Date.now() - inicioDoAudio) / 1000;

  const {words, execucao} = await transcreverWhisperX(audio, {prazoMs: 10 * 60_000});

  // Volta: cada palavra vai para o trecho que contém o meio dela.
  const inicios = trechos.reduce<number[]>((lista, t, i) => [...lista, i === 0 ? 0 : lista[i - 1] + (trechos[i - 1].ateS - trechos[i - 1].deS)], []);
  const devolvidas = words.map((word) => {
    const meioS = (word.startMs + word.endMs) / 2000;
    const i = Math.max(0, inicios.filter((inicio) => inicio <= meioS).length - 1);
    const t = trechos[i];
    const paraOrigem = (ms: number) => Math.round(Math.min(t.ateS * 1000, Math.max(t.deS * 1000, t.deS * 1000 + ms - inicios[i] * 1000)));
    return {...word, trecho: i, take: t.take, startMs: paraOrigem(word.startMs), endMs: paraOrigem(word.endMs)};
  });

  // Conferência com a transcrição salva da Mechas (take 1).
  const salvas = (JSON.parse(readFileSync(path.join(RAIZ, "transcricao.json"), "utf8")) as {words: Word[]}).words;
  const limpa = (texto: string) => texto.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const diferencas = devolvidas
    .filter((p) => p.take === takes[0])
    .map((p) => {
      const mesma = salvas
        .filter((s) => limpa(s.text) === limpa(p.text))
        .sort((a, b) => Math.abs(a.startMs - p.startMs) - Math.abs(b.startMs - p.startMs))[0];
      return mesma ? {texto: p.text, juntadaMs: p.startMs, salvaMs: mesma.startMs, diferencaMs: p.startMs - mesma.startMs} : {texto: p.text, semPar: true};
    });

  const resultado = {trechos, segundosTranscritos: inicios[inicios.length - 1] + 4, juntarS, execucao: {...execucao, logs: undefined}, palavras: devolvidas, conferenciaMechas: diferencas};
  writeFileSync(saida, JSON.stringify(resultado, null, 1));
  console.log(
    `Juntar o áudio: ${juntarS.toFixed(1)} s · WhisperX: processamento ${execucao.processamentoS.toFixed(1)} s, total ${execucao.totalS.toFixed(1)} s, US$ ${execucao.custoUsd.toFixed(4)} · ${devolvidas.length} palavras`,
  );
  console.log(diferencas.map((d) => JSON.stringify(d)).join("\n"));
} finally {
  rmSync(temp, {recursive: true, force: true});
}
