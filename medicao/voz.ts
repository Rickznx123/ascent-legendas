// Áudio e detecção de voz para a medição de sincronia: extrai o áudio (mono,
// 16 kHz), calcula a energia em janelas de 10 ms e marca onde a voz começa depois
// de um silêncio e onde ela para antes de um.
import {execFile} from "node:child_process";
import {ffmpegPath} from "../src/motor/ferramentas";

export const TAXA = 16000;
export const JANELA_MS = 10;
const AMOSTRAS_POR_JANELA = (TAXA * JANELA_MS) / 1000;

export const VOZ_CONFIG = {
  // Silêncio mínimo (ms) antes de um começo de voz e depois de um fim.
  silencioMinimoMs: 150,
  // Trecho de voz mais curto que isto (ms) é ruído (estalo, respiração curta).
  vozMinimaMs: 60,
  // Limiares, em fração da faixa entre o piso de ruído e o pico da fala (dB):
  // o alto confirma que há voz; o começo e o fim são levados até o baixo, para não
  // perder o ataque suave de uma palavra.
  limiarAlto: 0.35,
  limiarBaixo: 0.18,
  // Pré-ênfase (realça consoantes como "s", "f", "ch", fracas em energia).
  preEnfase: 0.97,
};

// Áudio mono 16 kHz em amostras de -1 a 1.
export const extrairAudio = (video: string): Promise<Float32Array> =>
  new Promise((resolve, reject) => {
    execFile(
      ffmpegPath(),
      ["-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", String(TAXA), "-f", "s16le", "-acodec", "pcm_s16le", "-"],
      {encoding: "buffer", maxBuffer: 1 << 30},
      (erro, saida) => {
        if (erro) {
          reject(erro);
          return;
        }
        const pcm = new Int16Array(saida.buffer, saida.byteOffset, Math.floor(saida.byteLength / 2));
        resolve(Float32Array.from(pcm, (amostra) => amostra / 32768));
      },
    );
  });

// Energia (dB) de cada janela de 10 ms, com pré-ênfase.
export const energiaPorJanela = (audio: Float32Array): number[] => {
  const total = Math.floor(audio.length / AMOSTRAS_POR_JANELA);
  const energia: number[] = [];
  for (let janela = 0; janela < total; janela++) {
    let soma = 0;
    const inicio = janela * AMOSTRAS_POR_JANELA;
    for (let i = inicio; i < inicio + AMOSTRAS_POR_JANELA; i++) {
      const anterior = i > 0 ? audio[i - 1] : 0;
      const valor = audio[i] - VOZ_CONFIG.preEnfase * anterior;
      soma += valor * valor;
    }
    energia.push(10 * Math.log10(soma / AMOSTRAS_POR_JANELA + 1e-10));
  }
  return energia;
};

const percentil = (valores: number[], p: number): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.round((p / 100) * (ordenados.length - 1))))];
};

export type Voz = {
  // Trechos de voz [início, fim) em ms, já sem os silêncios curtos no meio.
  trechos: {inicioMs: number; fimMs: number}[];
  // Começos de voz depois de um silêncio de silencioMinimoMs ou mais.
  comecos: number[];
  // Fins de voz antes de um silêncio de silencioMinimoMs ou mais.
  fins: number[];
  limiarAltoDb: number;
  limiarBaixoDb: number;
  pisoDb: number;
  picoDb: number;
};

export const detectarVoz = (energia: number[]): Voz => {
  const piso = percentil(energia, 10);
  const pico = percentil(energia, 98);
  const alto = piso + VOZ_CONFIG.limiarAlto * (pico - piso);
  const baixo = piso + VOZ_CONFIG.limiarBaixo * (pico - piso);

  // Trechos: cada janela acima do limiar alto, estendida para os dois lados enquanto
  // a energia fica acima do baixo.
  const brutos: {de: number; ate: number}[] = [];
  for (let j = 0; j < energia.length; j++) {
    if (energia[j] < alto) {
      continue;
    }
    let de = j;
    while (de > 0 && energia[de - 1] >= baixo) de--;
    let ate = j;
    while (ate + 1 < energia.length && energia[ate + 1] >= baixo) ate++;
    const ultimo = brutos[brutos.length - 1];
    if (ultimo && de <= ultimo.ate + 1) {
      ultimo.ate = Math.max(ultimo.ate, ate);
    } else {
      brutos.push({de, ate});
    }
    j = ate;
  }

  // Junta trechos separados por menos que o silêncio mínimo; descarta os curtos.
  const silencioJanelas = VOZ_CONFIG.silencioMinimoMs / JANELA_MS;
  const juntos: {de: number; ate: number}[] = [];
  for (const trecho of brutos) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && trecho.de - ultimo.ate - 1 < silencioJanelas) {
      ultimo.ate = trecho.ate;
    } else {
      juntos.push({...trecho});
    }
  }
  const trechos = juntos
    .filter((t) => (t.ate - t.de + 1) * JANELA_MS >= VOZ_CONFIG.vozMinimaMs)
    .map((t) => ({inicioMs: t.de * JANELA_MS, fimMs: (t.ate + 1) * JANELA_MS}));

  // Começo depois de silêncio (o do início do arquivo só conta se houver silêncio
  // antes dele) e fim antes de silêncio (o último só se houver silêncio depois).
  const duracaoMs = energia.length * JANELA_MS;
  const comecos = trechos
    .filter((t, i) => (i === 0 ? t.inicioMs : t.inicioMs - trechos[i - 1].fimMs) >= VOZ_CONFIG.silencioMinimoMs)
    .map((t) => t.inicioMs);
  const fins = trechos
    .filter((t, i) => (i === trechos.length - 1 ? duracaoMs - t.fimMs : trechos[i + 1].inicioMs - t.fimMs) >= VOZ_CONFIG.silencioMinimoMs)
    .map((t) => t.fimMs);

  return {trechos, comecos, fins, limiarAltoDb: alto, limiarBaixoDb: baixo, pisoDb: piso, picoDb: pico};
};

// WAV mono 16 bits (para tocar na página de conferência).
export const wav = (audio: Float32Array): Buffer => {
  const dados = Buffer.alloc(audio.length * 2);
  audio.forEach((amostra, i) => dados.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(amostra * 32767))), i * 2));
  const cabecalho = Buffer.alloc(44);
  cabecalho.write("RIFF", 0);
  cabecalho.writeUInt32LE(36 + dados.length, 4);
  cabecalho.write("WAVE", 8);
  cabecalho.write("fmt ", 12);
  cabecalho.writeUInt32LE(16, 16);
  cabecalho.writeUInt16LE(1, 20);
  cabecalho.writeUInt16LE(1, 22);
  cabecalho.writeUInt32LE(TAXA, 24);
  cabecalho.writeUInt32LE(TAXA * 2, 28);
  cabecalho.writeUInt16LE(2, 32);
  cabecalho.writeUInt16LE(16, 34);
  cabecalho.write("data", 36);
  cabecalho.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cabecalho, dados]);
};
