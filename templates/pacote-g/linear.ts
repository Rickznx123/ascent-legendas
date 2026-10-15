import type {CaptionTemplate} from "../../src/types";
import {BLOCO, SOBE} from "./_estilos";

/*
 * LINEAR DO PACOTE G
 * Respiro entre os destaques: até 3 palavras, bold de 8,4%, uma linha só (reduzida
 * se não couber), branco com o brilho da paleta e sem palavra-chave pintada.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {...BLOCO, fontWeight: 700, fontSize: "8.4cqw", letterSpacing: "-.025em", lineHeight: 1},
  },
  animations: {word: SOBE, keyword: SOBE},
  linhaUnica: true,
};

export default template;
