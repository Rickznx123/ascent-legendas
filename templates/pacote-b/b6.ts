import type {CaptionTemplate} from "../../src/types";
import {BLOCO, DIDONE_ITALICA, FOCO, FORTE, KW, SANS, SOBE, TX} from "./_estilos";

/*
 * B6 — SERIFA COM SELO
 * Topo com palavras finas de 5% e a última pesada de 8%. Palavra-chave serifada
 * itálica com 82% da largura (teto 28%). Selo sans 800 de 5% embaixo à direita.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "topo-selo",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {
      fontFamily: SANS,
      fontWeight: 300,
      fontSize: "5cqw",
      lineHeight: 1,
      marginBottom: "-.5em",
      position: "relative",
      zIndex: 1,
    },
    emphasis: {...FORTE, fontSize: "8cqw"},
    keywordOuter: KW,
    keyword: {...TX, ...DIDONE_ITALICA},
    supportBelow: {
      textAlign: "right",
      fontFamily: SANS,
      fontWeight: 800,
      fontSize: "5cqw",
      lineHeight: 1,
      letterSpacing: "-.03em",
      marginTop: "-.3em",
      paddingRight: ".4em",
      position: "relative",
    },
  },
  keywordFit: {targetWidthPercent: 82, maxFontPercent: 28},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
