import type {CaptionTemplate} from "../../src/types";
import {ACENDE, APOIO, BLOCO, FORTE, KW, SOBE, TX} from "./_estilos";

/*
 * G3 — PILHA CRESCENTE (alinhada à esquerda)
 * Apoio de 6%, apoio de 10% (a última palavra antes da chave) e a palavra-chave
 * com 62% da largura (teto 24%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {...APOIO, fontSize: "6cqw"},
    complement: {...APOIO, fontSize: "10cqw", marginTop: ".02em"},
    keywordOuter: {...KW, marginTop: ".02em"},
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 62, maxFontPercent: 24},
  animations: {word: SOBE, keyword: ACENDE},
};

export default template;
