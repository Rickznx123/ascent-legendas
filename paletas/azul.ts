import type {Palette} from "../src/types";

/*
 * PALETA "AZUL" — body.azul de templates/pacote-d/referencia.html.
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #c9f1ff 0%, #3fb6ff 50%, #1166e8 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#c9f1ff", position: 0},
      {color: "#3fb6ff", position: 50},
      {color: "#1166e8", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(60,160,255,.65)", outer: "rgba(20,110,255,.4)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (o brilho desta paleta, mais forte)
  brilhoLinear: {l1: "rgba(60,160,255,.95)", l2: "rgba(20,110,255,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
