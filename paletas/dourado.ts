import type {Palette} from "../src/types";

/*
 * PALETA "DOURADO" — body.dourado de templates/pacote-d/referencia.html.
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #fff3c4 0%, #e9c46a 30%, #b8862b 58%, #f1d27a 78%, #8a5a12 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#fff3c4", position: 0},
      {color: "#e9c46a", position: 30},
      {color: "#b8862b", position: 58},
      {color: "#f1d27a", position: 78},
      {color: "#8a5a12", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(233,190,90,.55)", outer: "rgba(200,150,40,.3)", intensity: 1},

  shadow: {color: "#000000"},
};

export default palette;
