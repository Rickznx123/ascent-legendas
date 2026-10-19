import type {CaptionTemplate} from "../../src/types";
import {CARACTERES_POR_LINHA, LEGENDA, LINHA, LUGAR_LINEAR, PARADA, PINTURA, SAIDA} from "./_estilos";

/*
 * H1 · PADRÃO — linear embaixo, Inter Medium, sombra suave. A frase entra apagada
 * (45%) e cada palavra se pinta na cor da paleta durante a fala.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {block: LEGENDA, support: LINHA},
  animations: {word: PARADA, keyword: PARADA},
  maxCharactersPerLine: CARACTERES_POR_LINHA,
  pintura: PINTURA,
  saida: SAIDA,
  posicao: LUGAR_LINEAR,
};

export default template;
