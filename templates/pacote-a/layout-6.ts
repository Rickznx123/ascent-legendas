import type {CaptionTemplate} from "../../src/types";
import {BLOCO, SOBE} from "./_estilos";

/*
 * 6 — LINEAR
 * Sans 600, 7,2% da largura, palavras juntas e centralizadas.
 * É o respiro entre dois destaques. Acima de 24 caracteres, quebra em duas linhas.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {...BLOCO, fontWeight: 600, fontSize: "7.2cqw", lineHeight: 1.1, letterSpacing: "-.02em"},
  },
  animations: {word: SOBE, keyword: SOBE},
  maxCharactersPerLine: 24,
};

export default template;
