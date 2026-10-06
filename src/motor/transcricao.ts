// Transcrição de um vídeo novo, a mesma no app, no terminal e nos scripts da nuvem:
//   1. WhisperX no Replicate (padrão: texto e tempos com alinhamento forçado);
//   2. Groq, se o WhisperX falhar, passar de PRAZO_DO_WHISPERX_MS ou faltar
//      REPLICATE_API_TOKEN no .env;
//   3. Whisper local (whisper.cpp), se a Groq também não der (sem internet) ou se
//      for pedido (local: true; no app e no terminal, TRANSCRICAO=local no .env).
// A detecção de voz roda junto, e o encaixe no áudio vem depois, pela Sincronia
// precisa (src/encaixe.ts). Cada desvio é registrado no log e em avisos.
// O áudio é extraído do vídeo uma vez só (WAV mono 16 kHz, num arquivo temporário)
// e serve a todos: WhisperX, Groq, detecção de voz e Whisper local. O vídeo pode ser
// um arquivo ou um endereço (o assinado do S3: o ffmpeg lê só o que precisa).
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {VozDoAudio, Word} from "../types";
import {execFileAsync, ffmpegPath} from "./ferramentas";
import {MODELO_GROQ, transcreverGroq} from "./groq";
import {WHISPER_MODEL} from "./projeto";
import {transcribeVideo} from "./transcrever";
import type {Progresso} from "./transcrever";
import {detectarVozDoVideo} from "./voz";
import {MODELO_WHISPERX, VERSAO_WHISPERX, transcreverWhisperX} from "./whisperx";
import type {ExecucaoWhisperX} from "./whisperx";

export const PRAZO_DO_WHISPERX_MS = 60_000;

export type MotorDeTranscricao = "whisperx" | "groq" | "local";

export type Transcricao = {
  words: Word[];
  voz: VozDoAudio;
  motor: MotorDeTranscricao;
  // Valor do campo model do transcricao.json.
  model: string;
  // O que não saiu como o padrão (reserva usada e por quê).
  avisos: string[];
  // Só no WhisperX: tempos e custo medidos da execução.
  execucao?: ExecucaoWhisperX;
  // Tempo da transcrição (com o envio do áudio) e da detecção de voz.
  transcricaoS: number;
  vozS: number;
};

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

// Áudio do vídeo num WAV temporário (mono 16 kHz, o que todos os motores usam).
// Devolve o caminho e uma função que apaga o arquivo.
export const extrairAudioParaTranscrever = async (video: string): Promise<{audio: string; apagar: () => Promise<void>}> => {
  const pasta = await mkdtemp(path.join(os.tmpdir(), "legendas-audio-"));
  const audio = path.join(pasta, "audio.wav");
  try {
    await execFileAsync(ffmpegPath(), ["-v", "error", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audio]);
  } catch (erro) {
    await rm(pasta, {recursive: true, force: true});
    throw erro;
  }
  return {audio, apagar: () => rm(pasta, {recursive: true, force: true})};
};

export const transcrever = async (
  root: string,
  video: string,
  {
    local = process.env.TRANSCRICAO?.trim().toLowerCase() === "local",
    semWhisperLocal = false,
    onProgress = () => undefined,
    log = (texto: string) => console.log(texto),
  }: {
    local?: boolean;
    // Servidor na internet: o Whisper local não existe nele. Sem WhisperX e Groq,
    // erro claro em vez da reserva local (e TRANSCRICAO=local não vale).
    semWhisperLocal?: boolean;
    onProgress?: Progresso;
    log?: (texto: string) => void;
  } = {},
): Promise<Transcricao> => {
  const avisos: string[] = [];
  const avisar = (texto: string) => {
    avisos.push(texto);
    log(`Transcrição: ${texto}`);
  };
  const inicio = Date.now();
  onProgress("Extraindo o áudio...");
  const {audio: inputPath, apagar} = await extrairAudioParaTranscrever(video);
  const extracaoS = (Date.now() - inicio) / 1000;
  log(`Transcrição: áudio extraído em ${extracaoS.toFixed(1)} s.`);
  try {
    return await transcreverAudio(root, inputPath, {local, semWhisperLocal, onProgress, log, avisos, avisar, inicio});
  } finally {
    await apagar();
  }
};

const transcreverAudio = async (
  root: string,
  inputPath: string,
  {
    local,
    semWhisperLocal,
    onProgress,
    log,
    avisos,
    avisar,
    inicio,
  }: {
    local: boolean;
    semWhisperLocal: boolean;
    onProgress: Progresso;
    log: (texto: string) => void;
    avisos: string[];
    avisar: (texto: string) => void;
    inicio: number;
  },
): Promise<Transcricao> => {
  let vozS = 0;
  const deteccao = detectarVozDoVideo(inputPath).then((voz) => {
    vozS = (Date.now() - inicio) / 1000;
    return voz;
  });
  // Sem rejeição solta se a transcrição falhar antes.
  deteccao.catch(() => undefined);
  const pronta = async (resto: Omit<Transcricao, "voz" | "avisos" | "transcricaoS" | "vozS">): Promise<Transcricao> => {
    const transcricaoS = (Date.now() - inicio) / 1000;
    const voz = await deteccao;
    log(`Transcrição: ${resto.motor === "whisperx" ? "WhisperX (Replicate)" : resto.motor === "groq" ? "Groq" : "Whisper local"}, ${resto.words.length} palavras em ${transcricaoS.toFixed(1)} s.`);
    return {...resto, voz, avisos, transcricaoS, vozS};
  };

  if (!local || semWhisperLocal) {
    if (process.env.REPLICATE_API_TOKEN?.trim()) {
      try {
        const {words, semTempo, execucao} = await transcreverWhisperX(inputPath, {prazoMs: PRAZO_DO_WHISPERX_MS, onProgress});
        if (semTempo.length > 0) {
          log(`Transcrição: ${semTempo.length} palavras sem tempo do alinhador (${semTempo.join(", ")}), no espaço entre as vizinhas.`);
        }
        log(
          `Transcrição: WhisperX ${execucao.id}: envio ${execucao.envioDoAudioS.toFixed(1)} s, espera ${execucao.esperaS.toFixed(1)} s, processamento ${execucao.processamentoS.toFixed(1)} s, custo US$ ${execucao.custoUsd.toFixed(4)}.`,
        );
        return await pronta({words, motor: "whisperx", model: `replicate/${MODELO_WHISPERX}@${VERSAO_WHISPERX}`, execucao});
      } catch (erro) {
        avisar(`o WhisperX falhou (${mensagem(erro)}); usando a Groq com encaixe.`);
      }
    } else {
      avisar("sem REPLICATE_API_TOKEN no .env; usando a Groq com encaixe.");
    }
    if (process.env.GROQ_API_KEY?.trim()) {
      try {
        onProgress("Transcrevendo com a Groq...");
        const {words} = await transcreverGroq(inputPath);
        return await pronta({words, motor: "groq", model: `groq/${MODELO_GROQ}`});
      } catch (erro) {
        if (semWhisperLocal) {
          log(`Transcrição: a Groq também falhou (${mensagem(erro)}).`);
          throw new Error("Não deu para transcrever agora: os serviços de transcrição não responderam. Tente de novo em alguns minutos.");
        }
        avisar(`a Groq também falhou (${mensagem(erro)}); usando o Whisper local.`);
      }
    } else {
      if (semWhisperLocal) {
        throw new Error("Não deu para transcrever: falta configurar o WhisperX ou a Groq no servidor.");
      }
      avisar("sem GROQ_API_KEY no .env; usando o Whisper local.");
    }
  }
  const words = await transcribeVideo(root, inputPath, onProgress);
  return await pronta({words, motor: "local", model: WHISPER_MODEL});
};
