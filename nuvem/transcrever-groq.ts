// npx tsx nuvem/transcrever-groq.ts [video.mp4]
// Transcreve só pela Groq (Whisper large v3, a reserva do WhisperX) e grava
// nuvem/resultados/transcricao-groq.json no formato do transcricao.json, com os
// blocos do agrupador atual e a voz do áudio. Não mexe no transcricao.json da raiz.
// A transcrição padrão (WhisperX, com a Groq de reserva) é nuvem/transcrever.ts.
import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {groupWords} from "../src/captions";
import {MODELO_GROQ, transcreverGroq} from "../src/motor/groq";
import {readProject} from "../src/motor/projeto";
import type {Projeto} from "../src/motor/projeto";
import {detectarVozDoVideo} from "../src/motor/voz";
import {RAIZ, exigir} from "./env";

export {MODELO_GROQ, normalizar, transcreverGroq} from "../src/motor/groq";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  exigir("GROQ_API_KEY");
  const inputPath = path.resolve(process.argv[2] ?? path.join(RAIZ, readProject(RAIZ)?.source ?? ""));
  // A detecção de voz (Sincronia precisa) roda enquanto a Groq transcreve.
  const [{words, respostaMs, extracaoMs, audioKb}, voz] = await Promise.all([transcreverGroq(inputPath), detectarVozDoVideo(inputPath)]);
  const projeto: Projeto = {
    source: path.basename(inputPath),
    language: "pt",
    model: `groq/${MODELO_GROQ}`,
    voz,
    words,
    blocks: groupWords(words),
  };
  const destino = path.join(RAIZ, "nuvem", "resultados", "transcricao-groq.json");
  mkdirSync(path.dirname(destino), {recursive: true});
  writeFileSync(destino, JSON.stringify(projeto, null, 2), "utf8");
  console.log(
    `${words.length} palavras, ${projeto.blocks.length} blocos. Áudio ${audioKb.toFixed(0)} KB (extração ${extracaoMs} ms), resposta da Groq em ${respostaMs} ms.`,
  );
  console.log(`Salvo em ${destino}`);
}
