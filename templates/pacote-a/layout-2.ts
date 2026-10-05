import type {CaptionTemplate} from "../../src/types";
import {APOIO, BLOCO, FOCO, ITALICA, PESADA, SOBE} from "./_estilos";

/*
 * 2 — PESADA + ITÁLICA
 * Palavra-chave sans 800 com 80% da largura (teto 19%). As palavras depois dela
 * viram um complemento serifado itálico de 10%, alinhado à direita e subindo 30%.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "pesada-italica",
  keywordEffect: "sombra",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: {...APOIO, margin: "0 0 .12em .1em"},
    keyword: PESADA,
    complement: {...ITALICA, display: "block", textAlign: "right", fontSize: "10cqw", marginTop: "-.3em"},
  },
  keywordFit: {targetWidthPercent: 80, maxFontPercent: 19},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
