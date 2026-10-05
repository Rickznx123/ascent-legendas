import type {CaptionTemplate} from "../../src/types";
import {BLOCO, SOBE} from "./_estilos";

/*
 * LINEAR DO PACOTE D
 * Respiro entre os destaques: sans 400 de 8,4%, uma linha só, sem palavra-chave
 * pintada. Nunca quebra linha.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {...BLOCO, fontWeight: 400, fontSize: "8.4cqw", lineHeight: 1, letterSpacing: "-.05em"},
  },
  animations: {word: SOBE, keyword: SOBE},
};

export default template;
