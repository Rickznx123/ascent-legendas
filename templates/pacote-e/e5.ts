import type {CaptionTemplate} from "../../src/types";
import {BLOCO, CHAVE_DE_DIR, CIMA, DE_ESQ, FORTE, GARA, KW, TX} from "./_estilos";

/*
 * E5 — ESQUERDA MISTA
 * Alinhado à esquerda: sans itálica de 7% e Garamond bold itálica de 12% (a
 * última palavra antes da chave), as duas vindo da esquerda, e a palavra-chave
 * pesada com 72% da largura (teto 28%), vindo da direita.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {...CIMA, fontSize: "7cqw"},
    complement: {...GARA, fontSize: "12cqw", marginTop: "-.04em"},
    keywordOuter: {...KW, marginTop: "-.08em"},
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 72, maxFontPercent: 28},
  animations: {word: DE_ESQ, top: DE_ESQ, complement: DE_ESQ, keyword: CHAVE_DE_DIR},
};

export default template;
