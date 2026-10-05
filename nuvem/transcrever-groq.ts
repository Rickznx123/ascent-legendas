// npx tsx nuvem/transcrever-groq.ts [video.mp4]
// Transcreve pela API da Groq (Whisper large v3) com tempo por palavra e grava
// nuvem/resultados/transcricao-groq.json no formato do transcricao.json, com os
// blocos do agrupador atual. Não mexe no transcricao.json da raiz.
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {groupWords} from "../src/captions";
import {execFileAsync, ffmpegPath} from "../src/motor/ferramentas";
import {readProject} from "../src/motor/projeto";
import type {Projeto} from "../src/motor/projeto";
import {detectarVozDoVideo} from "../src/motor/voz";
import type {VozDoAudio, Word} from "../src/types";
import {RAIZ, exigir} from "./env";

export const MODELO_GROQ = "whisper-large-v3";

type RespostaGroq = {
  text: string;
  segments?: {start: number; end: number; text: string}[];
  words?: {word: string; start: number; end: number}[];
};

// Só letras e números, sem acento e em minúsculas: para casar palavra com palavra.
export const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();

// As palavras da Groq vêm sem pontuação; o texto dos segmentos tem. O agrupador
// usa a pontuação para cortar, então cada palavra recebe a grafia do segmento
// quando as duas casam, na ordem.
const comPontuacao = (resposta: RespostaGroq): Word[] => {
  const grafias = (resposta.segments?.map((s) => s.text).join(" ") ?? resposta.text).split(/\s+/u).filter(Boolean);
  let cursor = 0;
  return (resposta.words ?? []).flatMap(({word, start, end}) => {
    const texto = word.trim();
    if (!normalizar(texto)) {
      return [];
    }
    // Procura a mesma palavra logo à frente (o texto pode ter tokens a mais).
    let grafia = texto;
    for (let olhar = cursor; olhar < Math.min(grafias.length, cursor + 4); olhar++) {
      if (normalizar(grafias[olhar]) === normalizar(texto)) {
        grafia = grafias[olhar];
        cursor = olhar + 1;
        break;
      }
    }
    return [{text: grafia, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000)}];
  });
};

export const transcreverGroq = async (
  inputPath: string,
): Promise<{words: Word[]; voz: VozDoAudio; respostaMs: number; extracaoMs: number; audioKb: number}> => {
  exigir("GROQ_API_KEY");
  // A detecção de voz (Sincronia precisa) roda enquanto a Groq transcreve.
  const deteccao = detectarVozDoVideo(inputPath);
  // Sem rejeição solta se a transcrição falhar antes.
  deteccao.catch(() => undefined);
  const temp = mkdtempSync(path.join(os.tmpdir(), "legendas-groq-"));
  try {
    // Mono, 16 kHz, MP3 de 48 kbps: a fala fica intacta e o arquivo pequeno.
    const audio = path.join(temp, "audio.mp3");
    const inicioExtracao = Date.now();
    await execFileAsync(ffmpegPath(), ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", audio]);
    const extracaoMs = Date.now() - inicioExtracao;
    const bytes = readFileSync(audio);

    const form = new FormData();
    form.append("file", new Blob([bytes], {type: "audio/mpeg"}), "audio.mp3");
    form.append("model", MODELO_GROQ);
    form.append("language", "pt");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    form.append("temperature", "0");

    const inicio = Date.now();
    const resposta = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}`},
      body: form,
    });
    const respostaMs = Date.now() - inicio;
    if (!resposta.ok) {
      throw new Error(`Groq respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
    }
    const words = comPontuacao((await resposta.json()) as RespostaGroq);
    if (words.length === 0) {
      throw new Error("A Groq não devolveu palavras com tempo.");
    }
    return {words, voz: await deteccao, respostaMs, extracaoMs, audioKb: bytes.length / 1024};
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = path.resolve(process.argv[2] ?? path.join(RAIZ, readProject(RAIZ)?.source ?? ""));
  const {words, voz, respostaMs, extracaoMs, audioKb} = await transcreverGroq(inputPath);
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
