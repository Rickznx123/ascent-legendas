import type {CaptionTemplate} from "../../src/types";
import {APOIO, DYN, ESCALA, INTER, LARGURA_DA_CHAVE, LUGAR_DINAMICO, MEIO, PARADA, PINTURA_DARK, SAIDA, VINHETA_DINAMICO} from "./_estilos";

/*
 * H4 · CENTRO — apoio colado em cima e embaixo, chave Inter Black no meio (50px na
 * prancha, ~3,3x o apoio), espaçamento -.04em. O padding de baixo evita cortar
 * g, j, p, q, y no degradê recortado; as margens negativas colam o apoio.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "tres-linhas",
  keywordEffect: "sombra",
  styles: {
    block: DYN,
    support: APOIO,
    keywordOuter: MEIO,
    // margin: -10px 0 -3px; padding: 0 .04em .06em
    keyword: {
      fontFamily: INTER,
      fontWeight: 900,
      lineHeight: 1.16,
      letterSpacing: "-.04em",
      padding: "0 .04em .06em",
      margin: "-.2em 0 -.06em",
    },
  },
  keywordFit: {targetWidthPercent: LARGURA_DA_CHAVE, maxFontPercent: 18.519},
  animations: {word: PARADA, keyword: ESCALA},
  pintura: PINTURA_DARK,
  vinheta: VINHETA_DINAMICO,
  saida: SAIDA,
  posicao: LUGAR_DINAMICO,
};

export default template;
