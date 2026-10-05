// Transcrição padrão: WhisperX no Replicate (victor-upmeet/whisperx), com
// alinhamento forçado por palavra em português. Texto e tempos vêm dele; o
// encaixe no áudio (Sincronia precisa) vem depois, como nas outras transcrições.
// Só o áudio sai da máquina (mono, 16 kHz, MP3 de 64 kbps), nunca o vídeo.
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import type {Word} from "../types";
import {execFileAsync, ffmpegPath} from "./ferramentas";

export const MODELO_WHISPERX = "victor-upmeet/whisperx";
// Versão fixa: a do teste aprovado (2026-10-05). Uma versão nova do modelo só
// entra trocando este hash, depois de medir de novo (npm run medir-sincronia).
export const VERSAO_WHISPERX = "655845d6190ef70573c669245f245892cd039df4b880a1e3a65852c09252f5cc";
// Hardware do modelo e preço por segundo (replicate.com/pricing, 2026-10-05).
// Modelos públicos cobram só o tempo de processamento (metrics.predict_time).
export const HARDWARE_WHISPERX = "Nvidia A100 (80GB)";
export const PRECO_POR_SEGUNDO_WHISPERX = 0.0014;
// Campos do schema que a chamada usa: se a versão fixada não os tiver, para.
const CAMPOS_USADOS = ["audio_file", "language", "align_output", "debug"];

export type ExecucaoWhisperX = {
  id: string;
  envioDoAudioS: number;
  // Da criação ao início do processamento: fila e partida a frio do modelo.
  esperaS: number;
  processamentoS: number;
  totalS: number;
  custoUsd: number;
  logs?: string;
};

type Previsao = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  created_at: string;
  started_at?: string;
  error?: string;
  logs?: string;
  metrics?: {predict_time?: number};
  output?: {segments: {start: number; end: number; words?: {word: string; start?: number; end?: number}[]}[]; detected_language: string};
};

export class ErroDoReplicate extends Error {}

// fimMs: instante (Date.now()) em que acaba o prazo; nenhuma chamada passa dele.
const cliente = (token: string, fimMs: number) => {
  const chamar = async <T>(caminho: string, init: RequestInit = {}): Promise<T> => {
    let resposta: Response;
    // Conta com pouco crédito: 1 criação por vez (429 com retry_after). Espera e tenta de novo.
    for (let tentativa = 1; ; tentativa++) {
      resposta = await fetch(`https://api.replicate.com/v1${caminho}`, {
        ...init,
        headers: {Authorization: `Bearer ${token}`, ...(init.headers ?? {})},
        signal: AbortSignal.timeout(Math.max(1000, fimMs - Date.now())),
      }).catch((erro: unknown) => {
        throw new ErroDoReplicate(`Sem resposta do Replicate em ${caminho}: ${erro instanceof Error ? erro.message : String(erro)}`);
      });
      if (resposta.status !== 429 || tentativa >= 5) {
        break;
      }
      const espera = Number(((await resposta.json().catch(() => ({}))) as {retry_after?: number}).retry_after ?? 2);
      await new Promise((r) => setTimeout(r, (espera + 1) * 1000));
    }
    if (!resposta.ok) {
      throw new ErroDoReplicate(`Replicate respondeu ${resposta.status} em ${caminho}: ${(await resposta.text()).trim().slice(0, 300)}`);
    }
    return (await resposta.json()) as T;
  };
  return chamar;
};

// Palavras com tempo. O WhisperX deixa sem tempo palavras que o alinhador não
// consegue casar (números, símbolos): elas ganham o espaço entre as vizinhas.
export const palavrasDoWhisperX = (saida: NonNullable<Previsao["output"]>): {words: Word[]; semTempo: string[]} => {
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

const segundos = (de?: string, ate?: string) => (de && ate ? Math.max(0, (Date.parse(ate) - Date.parse(de)) / 1000) : 0);

// Transcreve o áudio do vídeo. Passou de prazoMs (do começo do envio ao fim), a
// execução é cancelada no Replicate e a função falha (quem chama cai na reserva).
export const transcreverWhisperX = async (
  inputPath: string,
  {
    token = process.env.REPLICATE_API_TOKEN?.trim(),
    prazoMs = 60_000,
    onProgress = () => undefined,
  }: {token?: string; prazoMs?: number; onProgress?: (etapa: string) => void} = {},
): Promise<{words: Word[]; semTempo: string[]; execucao: ExecucaoWhisperX}> => {
  if (!token) {
    throw new ErroDoReplicate("Falta REPLICATE_API_TOKEN no .env.");
  }
  const inicio = Date.now();
  const chamar = cliente(token, inicio + prazoMs);
  const restante = () => prazoMs - (Date.now() - inicio);

  // O schema da versão fixada precisa ter os campos que a chamada usa.
  const versao = await chamar<{openapi_schema: {components: {schemas: {Input: {properties: Record<string, unknown>}}}}}>(
    `/models/${MODELO_WHISPERX}/versions/${VERSAO_WHISPERX}`,
  );
  const campos = versao.openapi_schema.components.schemas.Input.properties;
  const faltando = CAMPOS_USADOS.filter((campo) => !(campo in campos));
  if (faltando.length > 0) {
    throw new ErroDoReplicate(`A versão fixada do ${MODELO_WHISPERX} não tem: ${faltando.join(", ")}.`);
  }

  onProgress("Enviando o áudio...");
  const temp = mkdtempSync(path.join(os.tmpdir(), "legendas-whisperx-"));
  let bytes: Buffer;
  try {
    const audio = path.join(temp, "audio.mp3");
    await execFileAsync(ffmpegPath(), ["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", audio]);
    bytes = readFileSync(audio);
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }
  const form = new FormData();
  form.append("content", new Blob([new Uint8Array(bytes)], {type: "audio/mpeg"}), "audio.mp3");
  const arquivo = await chamar<{id: string; urls: {get: string}}>("/files", {method: "POST", body: form});
  const envioDoAudioS = (Date.now() - inicio) / 1000;

  try {
    onProgress("Transcrevendo com o WhisperX...");
    let previsao = await chamar<Previsao>("/predictions", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        version: VERSAO_WHISPERX,
        input: {audio_file: arquivo.urls.get, language: "pt", align_output: true, debug: true},
      }),
    });
    while (!["succeeded", "failed", "canceled"].includes(previsao.status)) {
      if (restante() <= 0) {
        // O cancelamento tem um prazo próprio (o da transcrição já acabou).
        await cliente(token, Date.now() + 10_000)(`/predictions/${previsao.id}/cancel`, {method: "POST"}).catch(() => undefined);
        throw new ErroDoReplicate(`O WhisperX passou de ${prazoMs / 1000} s (execução ${previsao.id} cancelada).`);
      }
      await new Promise((r) => setTimeout(r, Math.min(500, Math.max(0, restante()))));
      previsao = await chamar<Previsao>(`/predictions/${previsao.id}`);
    }
    if (previsao.status !== "succeeded" || !previsao.output) {
      throw new ErroDoReplicate(`O WhisperX terminou como ${previsao.status}: ${previsao.error ?? ""}`);
    }
    const {words, semTempo} = palavrasDoWhisperX(previsao.output);
    if (words.length === 0) {
      throw new ErroDoReplicate("O WhisperX não devolveu palavras com tempo.");
    }
    const processamentoS = previsao.metrics?.predict_time ?? 0;
    return {
      words,
      semTempo,
      execucao: {
        id: previsao.id,
        envioDoAudioS,
        esperaS: segundos(previsao.created_at, previsao.started_at),
        processamentoS,
        totalS: (Date.now() - inicio) / 1000,
        custoUsd: processamentoS * PRECO_POR_SEGUNDO_WHISPERX,
        logs: previsao.logs,
      },
    };
  } finally {
    await cliente(token, Date.now() + 10_000)(`/files/${arquivo.id}`, {method: "DELETE"}).catch(() => undefined);
  }
};
