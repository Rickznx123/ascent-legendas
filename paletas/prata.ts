import type {Palette} from "../src/types";

/*
 * PALETA "PRATA" — body.prata de templates/pacote-d/referencia.html.
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #ffffff 0%, #d9dde3 35%, #8f97a3 60%, #e8ebef 80%, #a9b0bb 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#ffffff", position: 0},
      {color: "#d9dde3", position: 35},
      {color: "#8f97a3", position: 60},
      {color: "#e8ebef", position: 80},
      {color: "#a9b0bb", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(220,230,245,.45)", outer: "rgba(200,215,235,.2)", intensity: 1},

  shadow: {color: "#000000"},
};

export default palette;
