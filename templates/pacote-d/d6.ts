import type {CaptionTemplate} from "../../src/types";
import {BLOCO, FOCO, FORTE, KW, LEVE, SOBE, TX} from "./_estilos";

/*
 * D6 — DUPLA (dois blocos na tela ao mesmo tempo)
 * O primeiro bloco entra em cima, à direita (apoio, chave com 50% da largura e
 * teto 26%, apoio). Ele continua na tela enquanto o bloco seguinte entra embaixo,
 * à esquerda, no tempo de fala dele (pilha com chave de 58%, teto 24%). Os dois
 * saem juntos. A dupla conta como um destaque no ritmo.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dupla",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    // .d6 { width: 86cqw }
    block: {...BLOCO, width: "86cqw"},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
  },
  pair: {
    // .g1: primeiro bloco, em cima, à direita
    firstGroup: {width: "max-content", marginLeft: "auto", textAlign: "right"},
    // .g2: segundo bloco, embaixo, à esquerda
    secondGroup: {width: "max-content", marginTop: "3cqw", marginRight: "auto", textAlign: "right"},
    first: {
      structure: "rotulo-rodape",
      styles: {
        block: {},
        support: {...LEVE, fontSize: "7cqw", marginBottom: "-.12em", position: "relative", zIndex: 1},
        keywordOuter: KW,
        keyword: {...TX, ...FORTE},
        supportBelow: {...LEVE, fontSize: "5cqw", marginTop: "-.12em"},
      },
      keywordFit: {targetWidthPercent: 50, maxFontPercent: 26},
    },
    second: {
      structure: "pilha",
      styles: {
        block: {},
        support: {...LEVE, fontSize: "7cqw"},
        complement: {...LEVE, fontSize: "5cqw", marginTop: "-.08em"},
        keywordOuter: {...KW, marginTop: "-.04em"},
        keyword: {...TX, ...FORTE},
      },
      keywordFit: {targetWidthPercent: 58, maxFontPercent: 24},
    },
  },
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
