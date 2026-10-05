// Compara os tempos das palavras de uma transcrição com os começos e fins de voz
// do áudio. Só entram as palavras logo depois de um silêncio (o começo) e logo
// antes de um (o fim): no meio da frase o áudio não dá um ponto confiável.
import type {Word} from "../src/types";

// Distância máxima (ms) entre a marca do áudio e a palavra para casar as duas.
const JANELA_DE_BUSCA_MS = 500;
// Limites do relatório: 1 quadro a 30 fps e um erro que já se nota a olho.
export const UM_QUADRO_MS = 33;
export const ERRO_VISIVEL_MS = 80;

export type Ponto = {
  tipo: "início" | "fim";
  indice: number;
  palavra: string;
  transcricaoMs: number;
  audioMs: number;
  // Positivo: a transcrição está atrasada em relação ao áudio.
  erroMs: number;
};

// Casa cada marca do áudio com a palavra mais próxima, em ordem (nunca volta
// para uma palavra anterior à última casada).
const casar = (marcas: number[], palavras: Word[], tipo: Ponto["tipo"]): Ponto[] => {
  const pontos: Ponto[] = [];
  let ultima = -1;
  for (const audioMs of marcas) {
    let melhor = -1;
    for (let i = ultima + 1; i < palavras.length; i++) {
      const t = tipo === "início" ? palavras[i].startMs : palavras[i].endMs;
      if (t > audioMs + JANELA_DE_BUSCA_MS) break;
      if (Math.abs(t - audioMs) <= JANELA_DE_BUSCA_MS && (melhor < 0 || Math.abs(t - audioMs) < Math.abs((tipo === "início" ? palavras[melhor].startMs : palavras[melhor].endMs) - audioMs))) {
        melhor = i;
      }
    }
    if (melhor >= 0) {
      const transcricaoMs = tipo === "início" ? palavras[melhor].startMs : palavras[melhor].endMs;
      pontos.push({tipo, indice: melhor, palavra: palavras[melhor].text, transcricaoMs, audioMs, erroMs: transcricaoMs - audioMs});
      ultima = melhor;
    }
  }
  return pontos;
};

export const compararComAudio = (palavras: Word[], comecos: number[], fins: number[]): Ponto[] =>
  [...casar(comecos, palavras, "início"), ...casar(fins, palavras, "fim")].sort((a, b) => a.audioMs - b.audioMs);

const mediana = (valores: number[]): number => {
  if (valores.length === 0) return 0;
  const o = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  return o.length % 2 ? o[meio] : (o[meio - 1] + o[meio]) / 2;
};

export type Estatisticas = {
  pontos: number;
  erroMedioMs: number;
  medianaMs: number;
  piorMs: number;
  acimaDeUmQuadro: number;
  acimaDe80Ms: number;
  // Erro com sinal (mediana): positivo = a transcrição atrasada.
  viesMs: number;
  // Se só a sincronia global corrigisse o viés: o que sobra.
  semVies: {erroMedioMs: number; acimaDeUmQuadro: number; acimaDe80Ms: number};
};

export const estatisticas = (pontos: Ponto[]): Estatisticas => {
  const abs = pontos.map((p) => Math.abs(p.erroMs));
  const vies = mediana(pontos.map((p) => p.erroMs));
  const semVies = pontos.map((p) => Math.abs(p.erroMs - vies));
  const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
  return {
    pontos: pontos.length,
    erroMedioMs: Math.round(media(abs)),
    medianaMs: Math.round(mediana(abs)),
    piorMs: Math.max(0, ...abs),
    acimaDeUmQuadro: abs.filter((e) => e > UM_QUADRO_MS).length,
    acimaDe80Ms: abs.filter((e) => e > ERRO_VISIVEL_MS).length,
    viesMs: Math.round(vies),
    semVies: {
      erroMedioMs: Math.round(media(semVies)),
      acimaDeUmQuadro: semVies.filter((e) => e > UM_QUADRO_MS).length,
      acimaDe80Ms: semVies.filter((e) => e > ERRO_VISIVEL_MS).length,
    },
  };
};

export const piores = (pontos: Ponto[], quantos = 15): Ponto[] =>
  [...pontos].sort((a, b) => Math.abs(b.erroMs) - Math.abs(a.erroMs)).slice(0, quantos);
