import type {CaptionTemplate} from "../../src/types";
import {BLOCO, DOIS, FOCO, FORTE, KW, LEVE, SOBE, TX} from "./_estilos";

/*
 * D2 — DOIS RÓTULOS E APOIO EMBAIXO
 * Dois rótulos leves de 5% nas pontas de cima. Palavra-chave pesada com 78% da
 * largura (teto 30%). Apoio leve de 11% embaixo, à direita.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dois-rotulos",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...LEVE, ...DOIS, fontSize: "5cqw", letterSpacing: "-.03em", marginBottom: "-.05em"},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
    complement: {...LEVE, fontSize: "11cqw", marginTop: "-.14em", textAlign: "right", position: "relative"},
  },
  keywordFit: {targetWidthPercent: 78, maxFontPercent: 30},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
