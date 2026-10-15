import type {CaptionTemplate} from "../../src/types";
import {BLOCO, SOBE, SOMBRA_LINEAR} from "./_estilos";

/*
 * LINEAR DO PACOTE G
 * Respiro entre os destaques: até 3 palavras, Montserrat Bold de 7,6%, uma linha só
 * (reduzida se não couber). Branco com sombra escura e sem brilho, igual em todas as
 * paletas (inclusive na paleta própria de um bloco): cor e sombra fixas, não da paleta.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {
      ...BLOCO,
      color: "#ffffff",
      textShadow: SOMBRA_LINEAR,
      fontSize: "7.6cqw",
      letterSpacing: "-.02em",
      lineHeight: 1,
    },
  },
  animations: {word: SOBE, keyword: SOBE},
  linhaUnica: true,
};

export default template;
