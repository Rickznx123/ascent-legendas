import type {CaptionTemplate} from "../../src/types";
import {APOIO, BLOCO, FOCO, ITALICA, SOBE} from "./_estilos";

/*
 * 7 — TRÊS LINHAS
 * Apoio em cima e embaixo, os dois com 5,4% da largura e encostados na
 * palavra-chave. Palavra-chave serifada itálica com 74% da largura (teto 24%)
 * e brilho, como no layout 1. Usado quando a linha de cima ficaria com uma
 * palavra curta sozinha. Sem palavras antes da chave, fica só chave + apoio embaixo.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "tres-linhas",
  keywordEffect: "brilho",
  styles: {
    block: BLOCO,
    support: {...APOIO, marginBottom: "-.35em", position: "relative", zIndex: 1},
    supportBelow: {...APOIO, marginTop: "-.1em", position: "relative", zIndex: 1},
    keyword: ITALICA,
  },
  keywordFit: {targetWidthPercent: 74, maxFontPercent: 24},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
