import type {CaptionTemplate} from "../../src/types";
import {BLOCO, CHAVE_DE_BAIXO, CIMA, DE_DIR, DE_ESQ, FORTE, GARA, KW, TX} from "./_estilos";

/*
 * E1 — CIMA, CHAVE E GARAMOND EMBAIXO (alinhado à esquerda)
 * Sans itálica de 6,4% em cima, vindo da esquerda. Palavra-chave pesada com 80% da
 * largura (teto 28%), subindo. Garamond bold itálica de 10% embaixo à direita,
 * vindo da direita.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "rotulo-rodape",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {...CIMA, fontSize: "6.4cqw", margin: "0 0 -.08em .1em", position: "relative", zIndex: 1},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
    supportBelow: {...GARA, textAlign: "right", fontSize: "10cqw", marginTop: "-.24em", position: "relative"},
  },
  keywordFit: {targetWidthPercent: 80, maxFontPercent: 28},
  animations: {word: DE_ESQ, top: DE_ESQ, below: DE_DIR, keyword: CHAVE_DE_BAIXO},
};

export default template;
