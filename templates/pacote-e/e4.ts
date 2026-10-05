import type {CaptionTemplate} from "../../src/types";
import {BLOCO, CHAVE_DE_ESQ, CIMA, DE_CIMA, DOIS, FORTE, KW, TX} from "./_estilos";

/*
 * E4 — CHAVE GIGANTE
 * Dois rótulos em sans itálica de 5% nas pontas de cima, descendo. Palavra-chave
 * pesada com 86% da largura (teto 32%), vindo da esquerda.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dois-rotulos",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...CIMA, ...DOIS, fontSize: "5cqw", marginBottom: "-.08em", position: "relative", zIndex: 1},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 86, maxFontPercent: 32},
  animations: {word: DE_CIMA, labelLeft: DE_CIMA, labelRight: DE_CIMA, keyword: CHAVE_DE_ESQ},
};

export default template;
