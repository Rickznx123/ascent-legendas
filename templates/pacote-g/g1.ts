import type {CaptionTemplate} from "../../src/types";
import {ACENDE, APOIO, BLOCO, FORTE, KW, SOBE, TX} from "./_estilos";

/*
 * G1 — APOIO E CHAVE
 * Centralizado. Apoio semibold de 7% em cima e palavra-chave extrabold com 76% da
 * largura (teto 22%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "apoio-serifa",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...APOIO, fontSize: "7cqw", marginBottom: ".06em"},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 76, maxFontPercent: 22},
  animations: {word: SOBE, keyword: ACENDE},
};

export default template;
