import type {CaptionTemplate} from "../../src/types";
import {ACENDE, BLOCO, DOIS, FORTE, KW, ROTULO, SOBE, TX} from "./_estilos";

/*
 * G2 — DOIS RÓTULOS
 * Duas palavras em caixa-alta espaçada (4,2%) nas pontas de cima. Palavra-chave
 * bold com 72% da largura (teto 26%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dois-rotulos",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...ROTULO, ...DOIS, marginBottom: ".22em"},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 72, maxFontPercent: 26},
  animations: {word: SOBE, keyword: ACENDE},
};

export default template;
