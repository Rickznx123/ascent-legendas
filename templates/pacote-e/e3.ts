import type {CaptionTemplate} from "../../src/types";
import {BLOCO, CHAVE_DE_BAIXO, CIMA, DE_CIMA, DE_ESQ, FORTE, GARA, KW, TX} from "./_estilos";

/*
 * E3 — PILHA CRESCENTE (centralizada)
 * Sans itálica de 6% descendo, Garamond bold itálica de 12% vindo da esquerda (a
 * última palavra antes da chave) e a palavra-chave pesada com 68% da largura
 * (teto 30%), subindo.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...CIMA, fontSize: "6cqw"},
    complement: {...GARA, fontSize: "12cqw", marginTop: "-.02em"},
    keywordOuter: {...KW, marginTop: "-.08em"},
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 68, maxFontPercent: 30},
  animations: {word: DE_CIMA, top: DE_CIMA, complement: DE_ESQ, keyword: CHAVE_DE_BAIXO},
};

export default template;
