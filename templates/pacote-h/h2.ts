import type {CaptionTemplate} from "../../src/types";
import {CARACTERES_POR_LINHA, LEGENDA, LUGAR_LINEAR, PARADA, PINTURA, SAIDA} from "./_estilos";

/*
 * H2 · TARJA — como o H1, sem sombra, com tarja preta 55% em cada linha
 * (.caixa: linhas em linha, line-height 1.55, padding 2px 6px, raio 3px).
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {...LEGENDA, lineHeight: 1.55},
    support: {
      display: "inline",
      background: "color-mix(in srgb, var(--cor-sombra) 55%, transparent)",
      padding: ".741cqw 2.222cqw",
      borderRadius: "1.111cqw",
      WebkitBoxDecorationBreak: "clone",
      boxDecorationBreak: "clone",
    },
  },
  animations: {word: PARADA, keyword: PARADA},
  maxCharactersPerLine: CARACTERES_POR_LINHA,
  pintura: {...PINTURA, sombra: undefined},
  saida: SAIDA,
  posicao: LUGAR_LINEAR,
};

export default template;
