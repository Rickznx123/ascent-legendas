// Pausas de um vídeo (PLANO-CORTES.md, Bloco 3): o silencedetect do ffmpeg, só no
// áudio, e a saída dele virando os trechos a cortar (já com a margem da fala).
import {execFileAsync, ffmpegPath} from "../../src/motor/ferramentas";
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

// entrada: a prévia leve (bem menor que o original) ou, sem ela, o próprio vídeo.
export const detectarPausas = async (entrada: string): Promise<Pausa[]> => {
  const {limiarDb, minimaMs} = PAUSAS_CONFIG;
  const {stderr} = await execFileAsync(
    ffmpegPath(),
    ["-hide_banner", "-nostats", "-i", entrada, "-vn", "-af", `silencedetect=noise=${limiarDb}dB:d=${minimaMs / 1000}`, "-f", "null", "-"],
    {maxBuffer: 32 * 1024 * 1024, timeout: PRAZO_MS},
  );
  return pausasDaSaida(stderr);
};
