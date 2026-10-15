import type {CaptionTemplate} from "../../src/types";
import {ACENDE, APOIO, BLOCO, FORTE, KW, LADO, SOBE, TX} from "./_estilos";

/*
 * G6 — APOIO, CHAVE E COMPLEMENTO (alinhado à direita)
 * Apoio de 6,4% em cima à esquerda, palavra-chave com 78% da largura (teto 22%) e
 * complemento de 6,4% embaixo à direita, deslizando da esquerda.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "rotulo-rodape",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "right"},
    support: {...APOIO, fontSize: "6.4cqw", textAlign: "left", margin: "0 0 .04em .1em"},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
    supportBelow: {...APOIO, fontSize: "6.4cqw", marginTop: ".08em"},
  },
  keywordFit: {targetWidthPercent: 78, maxFontPercent: 22},
  animations: {word: SOBE, keyword: ACENDE, below: LADO},
};

export default template;
