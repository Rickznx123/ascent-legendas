import type {CaptionTemplate} from "../../src/types";
import {BLOCO, FOCO, FORTE, KW, LEVE, SOBE, TX} from "./_estilos";

/*
 * D5 — PILHA DECRESCENTE (à direita)
 * Leve de 8%, leve de 5,4% (a última palavra antes da chave) e a palavra-chave
 * pesada com 72% da largura (teto 28%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pilha",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "right"},
    support: {...LEVE, fontSize: "8cqw"},
    complement: {...LEVE, fontSize: "5.4cqw", marginTop: "-.08em"},
    keywordOuter: {...KW, marginTop: "-.04em"},
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 72, maxFontPercent: 28},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
