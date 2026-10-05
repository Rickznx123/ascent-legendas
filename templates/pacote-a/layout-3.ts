import type {CaptionTemplate} from "../../src/types";
import {APOIO, BLOCO, FOCO, ITALICA, PESADA, SOBE} from "./_estilos";

/*
 * 3 — ESCADA
 * Três tamanhos alinhados à esquerda: apoio 5,4%, a palavra logo antes da chave
 * em itálico 13% recuada, palavra-chave pesada com 80% da largura (teto 19%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "escada",
  keywordEffect: "sombra",
  styles: {
    block: {...BLOCO, textAlign: "left"},
    support: APOIO,
    complement: {...ITALICA, display: "block", fontSize: "13cqw", margin: "-.05em 0 -.22em .3em"},
    keyword: PESADA,
  },
  keywordFit: {targetWidthPercent: 80, maxFontPercent: 19},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
