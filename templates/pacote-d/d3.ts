import type {CaptionTemplate} from "../../src/types";
import {BLOCO, FOCO, FORTE, KW, LEVE, SOBE, TX} from "./_estilos";

/*
 * D3 — PILHA CRESCENTE (à esquerda)
 * Leve de 6%, leve de 11% (a última palavra antes da chave) e a palavra-chave
 * pesada com 70% da largura (teto 30%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {...LEVE, fontSize: "6cqw"},
    complement: {...LEVE, fontSize: "11cqw", marginTop: "-.06em"},
    keywordOuter: {...KW, marginTop: "-.06em"},
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 70, maxFontPercent: 30},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
