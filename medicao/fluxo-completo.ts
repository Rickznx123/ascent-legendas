// npx tsx medicao/fluxo-completo.ts --video <arquivo.mp4> --nome <Nome> [--pacotes a,e] [--paleta nome] [--projeto existente.json]
//
// O fluxo novo de ponta a ponta, medido etapa por etapa, sem mexer no
// transcricao.json: transcreve (WhisperX, com as reservas de src/motor/transcricao.ts),
// salva o projeto à parte em medicao/resultados/<vídeo>.projeto-whisperx.json
// (projeto novo: Sincronia precisa ligada, 0 ms), encaixa no áudio e renderiza
// saidas/<Nome>-pacote-<p>-whisperx.mp4 em cada pacote. Se o transcricao.json for
// do mesmo vídeo, mostra as diferenças de texto entre ele e a transcrição nova.
// Com --projeto, reaproveita um projeto já transcrito (sem chamar o Replicate).
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {groupWords} from "../src/captions";
import {encaixarNoAudio} from "../src/encaixe";
import {novaSemente} from "../src/motor/blocos";
import {carregarEnv} from "../src/motor/env";
import {renderVideo} from "../src/motor/exportar";
import {SINCRONIA_DE_PROJETO_NOVO, readProject} from "../src/motor/projeto";
import type {Projeto} from "../src/motor/projeto";
import {transcrever} from "../src/motor/transcricao";
import {montarProps} from "../nuvem/props";
import {diferencas} from "./casar";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SAIDA = path.join(RAIZ, "medicao", "resultados");

const argumento = (nome: string): string | undefined => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const s = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const principal = async () => {
  carregarEnv(RAIZ);
  const video = path.resolve(argumento("--video") ?? "");
  const nome = argumento("--nome");
  if (!existsSync(video) || !nome) {
    throw new Error("Uso: npx tsx medicao/fluxo-completo.ts --video <arquivo.mp4> --nome <Nome> [--pacotes a,e] [--paleta nome]");
  }
  const pacotes = (argumento("--pacotes") ?? "a").split(",");
  const base = path.parse(video).name;
  const tempos: Record<string, number> = {};

  // 1. Transcrição (envio do áudio + WhisperX), com a detecção de voz junto.
  let projeto: Projeto;
  let resumoDaTranscricao: unknown;
  const reaproveitado = argumento("--projeto");
  if (reaproveitado) {
    projeto = JSON.parse(readFileSync(path.resolve(reaproveitado), "utf8")) as Projeto;
    console.log(`Projeto reaproveitado: ${reaproveitado} (${projeto.model})`);
  } else {
    const inicio = Date.now();
    const t = await transcrever(RAIZ, video, {onProgress: (etapa) => console.log(etapa)});
    tempos.transcricaoMs = Date.now() - inicio;
    projeto = {
      source: path.basename(video),
      language: "pt",
      model: t.model,
      ...SINCRONIA_DE_PROJETO_NOVO,
      semente: novaSemente(),
      voz: t.voz,
      words: t.words,
      blocks: groupWords(t.words),
    };
    resumoDaTranscricao = {motor: t.motor, avisos: t.avisos, execucao: t.execucao ? {...t.execucao, logs: undefined} : undefined, vozS: t.vozS};
    const destino = path.join(SAIDA, `${base}.projeto-whisperx.json`);
    writeFileSync(destino, JSON.stringify(projeto, null, 2));
    console.log(`Projeto salvo à parte em ${destino} (${projeto.words.length} palavras, ${projeto.blocks.length} blocos)`);
  }

  // 2. Encaixe no áudio (o render faz a mesma conta em blocosNaTela).
  const inicioEncaixe = performance.now();
  const encaixe = encaixarNoAudio(projeto.words, projeto.voz!);
  tempos.encaixeMs = performance.now() - inicioEncaixe;
  console.log(`Encaixe: ${encaixe.inicios} inícios e ${encaixe.fins} fins encaixados, ${encaixe.trechosDuvidosos} trechos duvidosos, em ${tempos.encaixeMs.toFixed(1)} ms`);

  // 3. Diferenças de texto em relação ao transcricao.json do mesmo vídeo.
  const atual = readProject(RAIZ);
  let comparacao: unknown;
  if (atual && atual.source === projeto.source) {
    const {casadas, diferencas: lista} = diferencas(atual.words, projeto.words);
    console.log(
      `\nTexto: transcricao.json atual (${atual.model}, ${atual.words.length} palavras) × nova (${projeto.words.length}): ${casadas} iguais, ${lista.length} trechos diferentes`,
    );
    for (const d of lista) {
      console.log(`  ${s(d.aMs)}  atual "${d.a || "—"}"  ×  nova "${d.b || "—"}"`);
    }
    comparacao = {modeloAtual: atual.model, casadas, diferencas: lista};
  }

  // 4. Render local de cada pacote.
  for (const pacote of pacotes) {
    const props = await montarProps(video, {pacote, paleta: argumento("--paleta")}, projeto);
    const saida = path.join(RAIZ, "saidas", `${nome}-pacote-${pacote}-whisperx.mp4`);
    const inicio = Date.now();
    let ultima = "";
    await renderVideo({root: RAIZ, inputPath: video, outputPath: saida, ...props}, (etapa) => {
      if (etapa !== ultima) {
        ultima = etapa;
      }
    });
    tempos[`render-${pacote}Ms`] = Date.now() - inicio;
    console.log(`Render pacote ${pacote}: ${s(tempos[`render-${pacote}Ms`])} → ${saida}`);
  }

  const registro = {video: path.basename(video), quando: new Date().toISOString(), duracaoS: projeto.voz?.duracaoMs ? projeto.voz.duracaoMs / 1000 : undefined, tempos, transcricao: resumoDaTranscricao, comparacao};
  const arquivo = path.join(SAIDA, "fluxo.json");
  const anteriores = existsSync(arquivo) ? (JSON.parse(readFileSync(arquivo, "utf8")) as unknown[]) : [];
  writeFileSync(arquivo, JSON.stringify([...anteriores, registro], null, 2));
  console.log(`\nTempos: ${Object.entries(tempos).map(([k, v]) => `${k.replace(/Ms$/u, "")} ${k === "encaixeMs" ? `${v.toFixed(1)} ms` : s(v)}`).join(" · ")}`);
};

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.stack : erro);
  process.exitCode = 1;
});
