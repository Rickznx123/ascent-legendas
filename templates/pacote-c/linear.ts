import type {CaptionTemplate} from "../../src/types";
import {ANTON, BLOCO, SOBE} from "./_estilos";

/*
 * LINEAR DO PACOTE C
 * Respiro entre os destaques: condensada em caixa-alta de 8%, entrelinha 1,08,
 * sem palavra-chave pintada. Acima de 22 caracteres, quebra em duas linhas.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {...BLOCO, ...ANTON, fontSize: "8cqw", lineHeight: 1.08, letterSpacing: ".01em"},
  },
  animations: {word: SOBE, keyword: SOBE},
  maxCharactersPerLine: 22,
};

export default template;
