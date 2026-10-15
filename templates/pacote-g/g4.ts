import type {CaptionTemplate} from "../../src/types";
import {ACENDE, BLOCO, FORTE, KW, SOBE, TX} from "./_estilos";

/*
 * G4 — CHAVE SOZINHA
 * Bloco de uma palavra: só a palavra-chave, com 80% da largura (teto 24%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "uma-palavra",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 80, maxFontPercent: 24},
  animations: {word: SOBE, keyword: ACENDE},
};

export default template;
