import type {CaptionTemplate} from "../../src/types";
import {ANTON, BATE, BLOCO, DOIS, KW, ROTULO, SCRIPT, SOBE, TX} from "./_estilos";

/*
 * C2 — CONDENSADA COM DOIS RÓTULOS
 * Dois rótulos de 4,8% nas pontas de cima. Palavra-chave condensada com 80% da
 * largura (teto 34%). Manuscrita de 15% embaixo, inclinada 4° e subindo 46%.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dois-rotulos",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...ROTULO, ...DOIS, marginBottom: ".12em"},
    keywordOuter: KW,
    keyword: {...TX, ...ANTON},
    complement: {...SCRIPT, fontSize: "15cqw", marginTop: "-.46em", transform: "rotate(-4deg)", position: "relative"},
  },
  keywordFit: {targetWidthPercent: 80, maxFontPercent: 34},
  animations: {word: SOBE, keyword: BATE},
};

export default template;
