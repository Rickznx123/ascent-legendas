import {existsSync, mkdtempSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {downloadWhisperModel, installWhisperCpp, toCaptions, transcribe} from "@remotion/install-whisper-cpp";
import {captionsToWords} from "../captions";
import type {Word} from "../types";
import {execFileAsync, ffmpegPath} from "./ferramentas";
import {WHISPER_MODEL} from "./projeto";

const WHISPER_VERSION = "1.6.0";

export type Progresso = (etapa: string, fracao?: number) => void;

// Extrai o áudio e transcreve em português com o whisper.cpp local.
export const transcribeVideo = async (
  root: string,
  inputPath: string,
  onProgress: Progresso = () => undefined,
): Promise<Word[]> => {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "legendas-dinamicas-"));
  const audioPath = path.join(tempDirectory, "audio.wav");

  try {
    onProgress("Extraindo áudio...");
    await execFileAsync(ffmpegPath(), [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      audioPath,
    ]);

    const whisperPath = path.join(root, "whisper.cpp");
    if (!existsSync(whisperPath)) {
      onProgress(`Instalando whisper.cpp ${WHISPER_VERSION} para uso local...`);
      await installWhisperCpp({to: whisperPath, version: WHISPER_VERSION});
    }

    onProgress(`Verificando o modelo local ${WHISPER_MODEL}...`);
    await downloadWhisperModel({
      model: WHISPER_MODEL,
      folder: whisperPath,
      onProgress: (downloaded, total) =>
        onProgress(`Baixando o modelo ${WHISPER_MODEL}...`, total > 0 ? downloaded / total : undefined),
    });

    onProgress("Transcrevendo em português...", 0);
    const previousDirectory = process.cwd();
    process.chdir(tempDirectory);
    let whisperOutput;
    try {
      whisperOutput = await transcribe({
        inputPath: audioPath,
        whisperPath,
        whisperCppVersion: WHISPER_VERSION,
        model: WHISPER_MODEL,
        tokenLevelTimestamps: true,
        language: "pt",
        printOutput: false,
        onProgress: (fraction) => onProgress("Transcrevendo em português...", fraction),
      });
    } finally {
      process.chdir(previousDirectory);
    }

    const words = captionsToWords(toCaptions({whisperCppOutput: whisperOutput}).captions);
    if (words.length === 0) {
      throw new Error("A transcrição não encontrou palavras para legendar.");
    }
    return words;
  } finally {
    rmSync(tempDirectory, {recursive: true, force: true});
  }
};
