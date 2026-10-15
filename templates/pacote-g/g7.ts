import type {CaptionTemplate} from "../../src/types";
import {ACENDE, APOIO, BLOCO, FORTE, KW, SOBE, TX} from "./_estilos";

/*
 * G7 — LINHA ÚNICA MISTA
 * Uma linha só: apoio bold de 8,6% e a palavra-chave na mesma linha, 25% maior e
 * extrabold. Para blocos de 2 a 4 palavras curtas.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "linha-mista",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, fontSize: "8.6cqw"},
    support: {...APOIO, fontWeight: 700},
    keywordOuter: {...KW, display: "inline-block", verticalAlign: "baseline"},
    keyword: {...TX, ...FORTE, fontSize: "1.25em"},
  },
  animations: {word: SOBE, keyword: ACENDE},
};

export default template;
