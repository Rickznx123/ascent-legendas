import type {CaptionTemplate} from "../../src/types";
import {BLOCO, CHAVE_DE_CIMA, CIMA, DE_BAIXO, DE_DIR, DE_ESQ, DOIS, FORTE, GARA, KW, TX} from "./_estilos";

/*
 * E2 — DOIS RÓTULOS E GARAMOND EMBAIXO
 * Dois rótulos em sans itálica de 5% nas pontas, um vindo de cada lado.
 * Palavra-chave pesada com 78% da largura (teto 30%), descendo. Garamond bold
 * itálica de 13% embaixo, subindo 30% sobre a palavra-chave.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dois-rotulos",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...CIMA, ...DOIS, fontSize: "5cqw", marginBottom: "-.02em"},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
    complement: {...GARA, fontSize: "13cqw", marginTop: "-.3em", position: "relative"},
  },
  keywordFit: {targetWidthPercent: 78, maxFontPercent: 30},
  animations: {
    word: DE_ESQ,
    labelLeft: DE_ESQ,
    labelRight: DE_DIR,
    complement: DE_BAIXO,
    keyword: CHAVE_DE_CIMA,
  },
};

export default template;
