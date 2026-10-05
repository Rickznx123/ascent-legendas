import type {CaptionTemplate} from "../../src/types";
import {BLOCO, CHAVE_DE_DIR, CIMA, DE_BAIXO, DE_CIMA, FORTE, GARA, KW, TX} from "./_estilos";

/*
 * E6 — CHAVE COM SELO
 * Topo em sans itálica de 5,6%, com a última palavra em Garamond de 9%, descendo.
 * Palavra-chave pesada com 82% da largura (teto 28%), vindo da direita. Selo em
 * Garamond bold itálica de 7,4% embaixo à direita, subindo.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "topo-selo",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...CIMA, fontSize: "5.6cqw", marginBottom: "-.1em", position: "relative", zIndex: 1},
    emphasis: {...GARA, fontSize: "9cqw"},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
    supportBelow: {
      ...GARA,
      textAlign: "right",
      fontSize: "7.4cqw",
      marginTop: "-.16em",
      paddingRight: ".15em",
      position: "relative",
    },
  },
  keywordFit: {targetWidthPercent: 82, maxFontPercent: 28},
  animations: {word: DE_CIMA, top: DE_CIMA, below: DE_BAIXO, keyword: CHAVE_DE_DIR},
};

export default template;
