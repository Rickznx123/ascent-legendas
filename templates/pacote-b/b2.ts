import type {CaptionTemplate} from "../../src/types";
import {BLOCO, DIDONE_ITALICA, DOIS, FOCO, KW, PESADA, ROTULO, SOBE, TX} from "./_estilos";

/*
 * B2 — PESADA COM DOIS RÓTULOS
 * Duas palavras nas pontas de cima. Palavra-chave sans 800 com 78% da largura
 * (teto 28%). Serifada itálica de 13% embaixo, subindo 40% sobre a palavra-chave.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "dois-rotulos",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {...ROTULO, ...DOIS, marginBottom: ".1em"},
    keywordOuter: KW,
    keyword: {...TX, ...PESADA},
    complement: {...DIDONE_ITALICA, fontSize: "13cqw", marginTop: "-.4em", position: "relative"},
  },
  keywordFit: {targetWidthPercent: 78, maxFontPercent: 28},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
