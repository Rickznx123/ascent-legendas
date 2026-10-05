import type {CaptionTemplate} from "../../src/types";
import {BLOCO, DOIS, FOCO, KW, ROTULO, SCRIPT, SOBE, TX_SCRIPT} from "./_estilos";

/*
 * C4 — MANUSCRITA GIGANTE
 * Palavra-chave em manuscrita com 84% da largura (teto 30%), inclinada 3° (no
 * elemento de fora). Dois rótulos pequenos nas pontas de cima, sobrepostos a ela.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dois-rotulos",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...ROTULO, ...DOIS, marginBottom: "-.2em"},
    keywordOuter: {...KW, transform: "rotate(-3deg)"},
    keyword: {...TX_SCRIPT, ...SCRIPT},
  },
  keywordFit: {targetWidthPercent: 84, maxFontPercent: 30},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
