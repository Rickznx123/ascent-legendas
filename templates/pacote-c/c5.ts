import type {CaptionTemplate} from "../../src/types";
import {ANTON, BLOCO, FOCO, KW, SCRIPT, SOBE, TX_SCRIPT} from "./_estilos";

/*
 * C5 — ESQUERDA MISTA
 * Alinhado à esquerda: duas linhas condensadas (8% e 13%; a de 13% é a última
 * palavra antes da chave) e a palavra-chave em manuscrita com 72% da largura
 * (teto 26%), inclinada 3° e subindo 12%.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {...ANTON, fontSize: "8cqw"},
    complement: {...ANTON, fontSize: "13cqw", marginTop: ".02em"},
    keywordOuter: {...KW, marginTop: "-.12em", transform: "rotate(-3deg)", transformOrigin: "left center"},
    keyword: {...TX_SCRIPT, ...SCRIPT},
  },
  keywordFit: {targetWidthPercent: 72, maxFontPercent: 26},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
