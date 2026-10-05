import type {CaptionTemplate} from "../../src/types";
import {BLOCO, DIDONE_ITALICA, DOIS, FOCO, KW, ROTULO, SOBE, TX} from "./_estilos";

/*
 * B4 — SERIFA GIGANTE
 * Palavra-chave serifada itálica com 84% da largura (teto 30%). Duas palavras
 * pequenas nas pontas de cima, sobrepostas ao topo dela.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dois-rotulos",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...ROTULO, ...DOIS, marginBottom: "-.6em"},
    keywordOuter: KW,
    keyword: {...TX, ...DIDONE_ITALICA},
  },
  keywordFit: {targetWidthPercent: 84, maxFontPercent: 30},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
