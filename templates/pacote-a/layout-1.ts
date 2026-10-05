import type {CaptionTemplate} from "../../src/types";
import {APOIO, BLOCO, FOCO, ITALICA, SOBE} from "./_estilos";

/*
 * 1 — APOIO + SERIFA
 * Apoio sans 500 (5,4% da largura) encostando no topo da palavra-chave.
 * Palavra-chave serifada itálica com 74% da largura (teto 24%) e brilho.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "apoio-serifa",
  keywordEffect: "brilho",
  styles: {
    block: BLOCO,
    support: {...APOIO, marginBottom: "-.35em", position: "relative", zIndex: 1},
    keyword: ITALICA,
  },
  keywordFit: {targetWidthPercent: 74, maxFontPercent: 24},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
