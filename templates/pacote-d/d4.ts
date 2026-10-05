import type {CaptionTemplate} from "../../src/types";
import {BLOCO, FORTE, KW, LEVE, PISCA, SOBE, TX} from "./_estilos";

/*
 * D4 — CHAVE GIGANTE COM PISCADA
 * Apoio leve de 6% em uma linha, em cima à esquerda. Palavra-chave pesada com 84%
 * da largura (teto 32%), entrando com a piscada: acende, apaga e acende de novo
 * em 0,7 s.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "apoio-serifa",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {
      ...LEVE,
      fontSize: "6cqw",
      textAlign: "left",
      margin: "0 0 -.1em .1em",
      position: "relative",
      zIndex: 1,
    },
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 84, maxFontPercent: 32},
  animations: {word: SOBE, keyword: PISCA},
};

export default template;
