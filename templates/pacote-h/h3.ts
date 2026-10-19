import type {CaptionTemplate} from "../../src/types";
import {CARACTERES_POR_LINHA, LEGENDA, LINHA, LUGAR_LINEAR, PARADA, PINTURA_DARK, SAIDA, VINHETA_DARK} from "./_estilos";

/*
 * H3 · DARK — Inter SemiBold, apagada 22%, preenche #F4F2EE (com a paleta branca),
 * sombra densa e vinheta preta nos 42% de baixo da tela.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {block: {...LEGENDA, fontWeight: 600, letterSpacing: "-.01em"}, support: LINHA},
  animations: {word: PARADA, keyword: PARADA},
  maxCharactersPerLine: CARACTERES_POR_LINHA,
  pintura: PINTURA_DARK,
  vinheta: VINHETA_DARK,
  saida: SAIDA,
  posicao: LUGAR_LINEAR,
};

export default template;
