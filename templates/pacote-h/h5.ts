import type {CaptionTemplate} from "../../src/types";
import {APOIO, DYN, ESCALA, INTER, LARGURA_DA_CHAVE, LUGAR_DINAMICO, MEIO, PARADA, PINTURA_DARK, SAIDA, VINHETA_DINAMICO} from "./_estilos";

/*
 * H5 · MOLDURA — apoio de cima à esquerda, de baixo à direita (4% para dentro),
 * chave Inter ExtraBold em caixa-alta (44px na prancha) e um fio branco 35% entre a
 * chave e o apoio de baixo.
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "tres-linhas",
  keywordEffect: "sombra",
  styles: {
    block: DYN,
    support: {...APOIO, textAlign: "left", paddingLeft: "4%"},
    supportBelow: {...APOIO, textAlign: "right", paddingRight: "4%"},
    keywordOuter: MEIO,
    // margin: 0 0 3px; padding-bottom: .02em
    keyword: {
      fontFamily: INTER,
      fontWeight: 800,
      lineHeight: 1,
      textTransform: "uppercase",
      letterSpacing: "-.02em",
      margin: "0 0 .068em",
      paddingBottom: ".02em",
    },
    // .fio — 1px, 38% de largura, margin: 0 auto 3px
    traco: {
      display: "block",
      height: ".37cqw",
      width: "38%",
      margin: "0 auto 1.111cqw",
      background: "color-mix(in srgb, var(--cor-apoio) 35%, transparent)",
    },
  },
  keywordFit: {targetWidthPercent: LARGURA_DA_CHAVE, maxFontPercent: 16.296},
  animations: {word: PARADA, keyword: ESCALA},
  pintura: PINTURA_DARK,
  vinheta: VINHETA_DINAMICO,
  saida: SAIDA,
  posicao: LUGAR_DINAMICO,
};

export default template;
