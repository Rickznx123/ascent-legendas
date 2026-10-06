import type {CaptionTemplate} from "../../src/types";
import {ANTON, BATE, BLOCO, KW, SOBE, TX} from "./_estilos";

/*
 * C3 — PILHA CRESCENTE
 * Três linhas condensadas centralizadas, crescendo: 7%, 14% (a última palavra
 * antes da chave) e a palavra-chave com 70% da largura (teto 36%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...ANTON, fontSize: "7cqw"},
    complement: {...ANTON, fontSize: "14cqw", marginTop: ".02em"},
    keywordOuter: {...KW, marginTop: ".02em"},
    keyword: {...TX, ...ANTON},
  },
  keywordFit: {targetWidthPercent: 70, maxFontPercent: 36},
  animations: {word: SOBE, keyword: BATE},
};

export default template;
