import type {CaptionTemplate} from "../../src/types";
import {BLOCO, FOCO, KW, PESADA, SOBE, TX} from "./_estilos";

/*
 * B3 — PILHA CRESCENTE (centralizada)
 * Três linhas sans 800 crescendo: 6%, 12% e a palavra-chave com 62% da largura
 * (teto 30%). A linha de 12% é a última palavra antes da chave. Entrelinha 0,88.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...PESADA, fontSize: "6cqw"},
    complement: {...PESADA, fontSize: "12cqw", marginTop: "-.04em"},
    keywordOuter: {...KW, marginTop: "-.03em"},
    keyword: {...TX, ...PESADA},
  },
  keywordFit: {targetWidthPercent: 62, maxFontPercent: 30},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
