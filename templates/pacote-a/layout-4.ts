import type {CaptionTemplate} from "../../src/types";
import {APOIO, BLOCO, FOCO, PESADA, SOBE} from "./_estilos";

/*
 * 4 — BLOCO (expressões protegidas)
 * A expressão vira duas linhas sans 800 ajustadas para a mesma largura (64%,
 * teto 30%), entrelinha 0,9: a primeira palavra em cima, o resto embaixo.
 * Palavras do bloco fora da expressão aparecem como apoio, acima ou abaixo.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "bloco",
  keywordEffect: "sombra",
  styles: {
    block: BLOCO,
    support: APOIO,
    keyword: PESADA,
    complement: {display: "block", marginTop: "-.02em"},
  },
  keywordFit: {targetWidthPercent: 64, maxFontPercent: 30},
  animations: {word: SOBE, keyword: FOCO},
};

export default template;
