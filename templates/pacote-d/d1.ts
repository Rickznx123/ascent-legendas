import type {CaptionTemplate} from "../../src/types";
import {BLOCO, FOCO, FORTE, KW, LEVE, SOBE, TX} from "./_estilos";

/*
 * D1 — APOIO, CHAVE, APOIO (alinhado à direita)
 * Apoio leve de 8% em cima, palavra-chave pesada com 64% da largura (teto 30%) e
 * apoio leve de 5,4% embaixo.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "rotulo-rodape",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "right"},
    support: {...LEVE, fontSize: "8cqw", marginBottom: "-.12em", position: "relative", zIndex: 1},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
    supportBelow: {...LEVE, fontSize: "5.4cqw", marginTop: "-.12em", position: "relative"},
  },
  keywordFit: {targetWidthPercent: 64, maxFontPercent: 30},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
