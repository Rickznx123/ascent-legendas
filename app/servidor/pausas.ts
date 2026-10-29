// Áudio de um vídeo, lido uma vez: as pausas (PLANO-CORTES.md, Bloco 3; o silencedetect
// do ffmpeg virando os trechos a cortar, já com a margem da fala) e os picos da forma
// de onda da timeline (canal A1).
import {execFileAsync, ffmpegPath} from "../../src/motor/ferramentas";
import {ONDA_MS} from "../web/trechos";
import {PAUSAS_CONFIG} from "./pausas-config";

// [início, fim] no tempo do vídeo, em ms.
export type Pausa = [number, number];

const PRAZO_MS = 10 * 60_000;

// Silêncio que vai até o fim do arquivo pode vir sem silence_end: termina na duração.
export const pausasDaSaida = (saida: string, config = PAUSAS_CONFIG): Pausa[] => {
  const duracao = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/u.exec(saida);
  const duracaoMs = duracao ? (Number(duracao[1]) * 3600 + Number(duracao[2]) * 60 + Number(duracao[3])) * 1000 : undefined;
  const silencios: Pausa[] = [];
  let comeco: number | undefined;
  for (const [, tipo, valor] of saida.matchAll(/silence_(start|end): (-?\d+(?:\.\d+)?)/gu)) {
    const ms = Number(valor) * 1000;
    if (tipo === "start") {
      comeco = Math.max(0, ms);
    } else if (comeco !== undefined) {
      silencios.push([comeco, ms]);
      comeco = undefined;
    }
  }
  if (comeco !== undefined && duracaoMs !== undefined) silencios.push([comeco, duracaoMs]);
  return silencios
    .filter(([inicio, fim]) => fim - inicio >= config.minimaMs)
    .map(([inicio, fim]): Pausa => [Math.round(inicio + config.margemMs), Math.round(fim - config.margemMs)])
    .filter(([inicio, fim]) => fim > inicio);
};

// Forma de onda: o maior volume de cada janela de ONDA_MS, de 0 a 255 (1 byte por janela).
// pcm: áudio mono, 16 bits, na TAXA_DA_ONDA.
export const TAXA_DA_ONDA = 8000;
export const picosDoAudio = (pcm: Buffer): Uint8Array => {
  const porJanela = (TAXA_DA_ONDA * ONDA_MS) / 1000;
  const amostras = Math.floor(pcm.length / 2);
  const picos = new Uint8Array(Math.ceil(amostras / porJanela));
  for (let i = 0; i < amostras; i++) {
    const valor = Math.round((Math.abs(pcm.readInt16LE(i * 2)) / 32768) * 255);
    const janela = Math.floor(i / porJanela);
    if (valor > picos[janela]) picos[janela] = Math.min(255, valor);
  }
  return picos;
};

// Uma leitura só do áudio (entrada: a prévia leve, bem menor que o original, ou o
// próprio vídeo): as pausas (silencedetect, no stderr) e a forma de onda (o áudio
// reduzido a mono 8 kHz, no stdout), guardada em base64. Vídeo sem áudio: nada.
export const analisarAudio = async (entrada: string): Promise<{pausas: Pausa[]; onda: string}> => {
  const {limiarDb, minimaMs} = PAUSAS_CONFIG;
  const filtro = `silencedetect=noise=${limiarDb}dB:d=${minimaMs / 1000},aresample=${TAXA_DA_ONDA},aformat=sample_fmts=s16:channel_layouts=mono`;
  try {
    const {stdout, stderr} = (await execFileAsync(
      ffmpegPath(),
      ["-hide_banner", "-nostats", "-i", entrada, "-map", "0:a:0?", "-af", filtro, "-f", "s16le", "-"],
      {encoding: "buffer", maxBuffer: 256 * 1024 * 1024, timeout: PRAZO_MS},
    )) as unknown as {stdout: Buffer; stderr: Buffer};
    return {pausas: pausasDaSaida(stderr.toString()), onda: Buffer.from(picosDoAudio(stdout)).toString("base64")};
  } catch (erro) {
    if (/does not contain any stream/u.test(String((erro as {stderr?: unknown}).stderr ?? ""))) return {pausas: [], onda: ""};
    throw erro;
  }
};
