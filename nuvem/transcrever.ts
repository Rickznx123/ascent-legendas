// npx tsx nuvem/transcrever.ts <video.mp4> [--saida projeto.json] [--local]
// Transcrição padrão para a nuvem: WhisperX no Replicate, com a Groq e o Whisper
// local de reserva (src/motor/transcricao.ts), mais a voz do áudio para o encaixe.
// Grava um projeto no formato do transcricao.json (padrão:
// nuvem/resultados/transcricao-<vídeo>.json), sem mexer no transcricao.json da raiz.
import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {groupWords} from "../src/captions";
import {SINCRONIA_DE_PROJETO_NOVO} from "../src/motor/projeto";
import type {Projeto} from "../src/motor/projeto";
import {transcrever} from "../src/motor/transcricao";
import {RAIZ} from "./env";

const valor = (opcao: string) => {
  const indice = process.argv.indexOf(opcao);
  return indice > 0 ? process.argv[indice + 1] : undefined;
};
const video = process.argv[2];
if (!video || video.startsWith("--")) {
  throw new Error("Uso: npx tsx nuvem/transcrever.ts <video.mp4> [--saida projeto.json] [--local]");
}
const inputPath = path.resolve(video);
const t = await transcrever(RAIZ, inputPath, {
  onProgress: (etapa) => console.log(etapa),
  ...(process.argv.includes("--local") ? {local: true} : {}),
});
const projeto: Projeto = {
  source: path.basename(inputPath),
  language: "pt",
  model: t.model,
  // Projeto novo: Sincronia precisa ligada e 0 ms.
  ...SINCRONIA_DE_PROJETO_NOVO,
  voz: t.voz,
  words: t.words,
  blocks: groupWords(t.words),
};
const destino = path.resolve(valor("--saida") ?? path.join(RAIZ, "nuvem", "resultados", `transcricao-${path.parse(inputPath).name}.json`));
mkdirSync(path.dirname(destino), {recursive: true});
writeFileSync(destino, JSON.stringify(projeto, null, 2), "utf8");
console.log(`${t.words.length} palavras, ${projeto.blocks.length} blocos (${t.motor}). Salvo em ${destino}`);
