import type {CaptionTemplate} from "../../src/types";
import {ANTON, BATE, BLOCO, KW, SCRIPT, SOBE, TX} from "./_estilos";

/*
 * C1 — MANUSCRITA, CONDENSADA E RODAPÉ (alinhado à esquerda)
 * Manuscrita de 10% inclinada 5°, entrando no topo da palavra-chave. Palavra-chave
 * condensada com 86% da largura (teto 34%). Rodapé à direita, 8%: palavras em
 * manuscrita, a última em condensada.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "rotulo-rodape",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {
      ...SCRIPT,
      fontSize: "10cqw",
      margin: "0 0 -.42em .15em",
      transform: "rotate(-5deg)",
      transformOrigin: "left bottom",
      position: "relative",
      zIndex: 1,
    },
    keywordOuter: KW,
    keyword: {...TX, ...ANTON},
    supportBelow: {...SCRIPT, textAlign: "right", fontSize: "8cqw", marginTop: "-.04em", position: "relative"},
    emphasis: {...ANTON, letterSpacing: ".02em"},
  },
  keywordFit: {targetWidthPercent: 86, maxFontPercent: 34},
  animations: {word: SOBE, keyword: BATE},
};

export default template;
