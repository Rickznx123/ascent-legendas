import type {CSSProperties} from "react";
import type {CaptionTemplate} from "../../src/types";
import {APOIO, DYN, ESCALA, LARGURA_DA_CHAVE, LUGAR_DINAMICO, MEIO, PARADA, PINTURA_DARK, SAIDA, SERIFA, VINHETA_DINAMICO} from "./_estilos";

/*
 * H6 · CINEMA — apoio Inter SemiBold em caixa-alta pequena (11px), espaçamento .22em;
 * chave Instrument Serif itálica grande (62px na prancha). O padding lateral dá
 * folga à inclinação e o de baixo às pernas das letras.
 */
const APOIO_CINEMA: CSSProperties = {...APOIO, fontSize: "4.074cqw", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".22em"};

const template: CaptionTemplate = {
  family: "destaque",
  structure: "tres-linhas",
  keywordEffect: "sombra",
  styles: {
    block: DYN,
    support: APOIO_CINEMA,
    supportBelow: APOIO_CINEMA,
    keywordOuter: MEIO,
    // margin: -8px 0 0; padding: 0 .1em .06em
    keyword: {
      fontFamily: SERIFA,
      fontStyle: "italic",
      fontWeight: 400,
      lineHeight: 1.12,
      letterSpacing: "-.01em",
      margin: "-.129em 0 0",
      padding: "0 .1em .06em",
    },
  },
  keywordFit: {targetWidthPercent: LARGURA_DA_CHAVE, maxFontPercent: 22.963},
  animations: {word: PARADA, keyword: ESCALA},
  pintura: PINTURA_DARK,
  vinheta: VINHETA_DINAMICO,
  saida: SAIDA,
  posicao: LUGAR_DINAMICO,
};

export default template;
