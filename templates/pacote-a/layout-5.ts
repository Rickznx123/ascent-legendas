import type {CaptionTemplate} from "../../src/types";
import {BLOCO, FOCO, ITALICA, SOBE} from "./_estilos";

/*
 * 5 — UMA PALAVRA
 * Só a palavra-chave, serifada itálica, 78% da largura (teto 26%), com brilho.
 * Entrada com desfoque e leve aumento.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "uma-palavra",
  keywordEffect: "brilho",
  styles: {
    block: BLOCO,
    keyword: ITALICA,
  },
  keywordFit: {targetWidthPercent: 78, maxFontPercent: 26},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
