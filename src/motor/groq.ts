// Transcrição pela API da Groq (Whisper large v3) com tempo por palavra. É a
// reserva do WhisperX (veja src/motor/transcricao.ts). Só o áudio vai para a Groq:
// mono, 16 kHz, MP3 de 48 kbps.
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import type {Word} from "../types";
import {execFileAsync, ffmpegPath} from "./ferramentas";

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
  apiKey = process.env.GROQ_API_KEY?.trim(),
): Promise<{words: Word[]; respostaMs: number; extracaoMs: number; audioKb: number}> => {
  if (!apiKey) {
    throw new Error("Falta GROQ_API_KEY no .env.");
  }
  const temp = mkdtempSync(path.join(os.tmpdir(), "legendas-groq-"));
  try {
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
      headers: {Authorization: `Bearer ${apiKey}`},
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
    return {words, respostaMs, extracaoMs, audioKb: bytes.length / 1024};
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
};
