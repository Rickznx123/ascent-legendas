import type {CaptionTemplate} from "../../src/types";
import {BLOCO, DIDONE_ITALICA, FOCO, KW, PESADA, SOBE, TX} from "./_estilos";

/*
 * B5 — ESQUERDA MISTA
 * Alinhado à esquerda: duas linhas sans 800 (8% e 12%; a de 12% é a última
 * palavra antes da chave) e a palavra-chave serifada itálica com 70% da largura
 * (teto 26%), subindo 14%.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {...PESADA, fontSize: "8cqw"},
    complement: {...PESADA, fontSize: "12cqw"},
    keywordOuter: {...KW, marginTop: "-.14em"},
    keyword: {...TX, ...DIDONE_ITALICA},
  },
  keywordFit: {targetWidthPercent: 70, maxFontPercent: 26},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
