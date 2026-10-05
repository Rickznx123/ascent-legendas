import type {CaptionTemplate} from "../../src/types";
import {BLOCO, DIDONE_ITALICA, FOCO, FORTE, KW, ROTULO, SANS, SOBE, TX} from "./_estilos";

/*
 * B1 — RÓTULO, SERIFA E RODAPÉ (alinhado à esquerda)
 * Rótulo sans 600 de 4,6% entrando no topo da palavra-chave. Palavra-chave
 * serifada itálica com 80% da largura (teto 26%). Rodapé à direita, 7%:
 * palavras finas, a última pesada.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "rotulo-rodape",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {...ROTULO, margin: "0 0 -.5em .5em"},
    keywordOuter: KW,
    keyword: {...TX, ...DIDONE_ITALICA},
    supportBelow: {
      textAlign: "right",
      fontFamily: SANS,
      fontWeight: 300,
      fontSize: "7cqw",
      lineHeight: 1,
      marginTop: "-.35em",
      position: "relative",
    },
    emphasis: FORTE,
  },
  keywordFit: {targetWidthPercent: 80, maxFontPercent: 26},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
