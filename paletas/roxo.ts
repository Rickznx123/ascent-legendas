import type {Palette} from "../src/types";

/*
 * PALETA "ROXO" — body.roxo de templates/pacote-d/referencia.html.
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #e9d5ff 0%, #a855f7 55%, #6d28d9 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#e9d5ff", position: 0},
      {color: "#a855f7", position: 55},
      {color: "#6d28d9", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(168,85,247,.65)", outer: "rgba(124,58,237,.4)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (o brilho desta paleta, mais forte)
  brilhoLinear: {l1: "rgba(168,85,247,.95)", l2: "rgba(124,58,237,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
