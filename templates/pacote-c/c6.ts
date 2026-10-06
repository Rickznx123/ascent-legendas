import type {CaptionTemplate} from "../../src/types";
import {ANTON, BATE, BLOCO, FONTE_ANTON, KW, SCRIPT, SOBE, TX} from "./_estilos";

/*
 * C6 — CONDENSADA COM SELO
 * Topo com rótulo de 4,8% e a última palavra em manuscrita de 9%. Palavra-chave
 * condensada com 84% da largura (teto 34%). Selo condensado espaçado de 5%
 * embaixo à direita.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "topo-selo",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {
      fontFamily: FONTE_ANTON,
      fontWeight: 400,
      fontSize: "4.8cqw",
      lineHeight: 1,
      textTransform: "uppercase",
      letterSpacing: ".08em",
      marginBottom: "-.15em",
      position: "relative",
      zIndex: 1,
    },
    emphasis: {...SCRIPT, fontSize: "9cqw", marginLeft: ".1em"},
    keywordOuter: KW,
    keyword: {...TX, ...ANTON},
    supportBelow: {
      textAlign: "right",
      fontFamily: FONTE_ANTON,
      fontWeight: 400,
      fontSize: "5cqw",
      lineHeight: 1,
      textTransform: "uppercase",
      letterSpacing: ".1em",
      marginTop: ".14em",
      paddingRight: ".1em",
      position: "relative",
    },
  },
  keywordFit: {targetWidthPercent: 84, maxFontPercent: 34},
  animations: {word: SOBE, keyword: BATE},
};

export default template;
