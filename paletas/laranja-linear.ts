import type {Palette} from "../src/types";

/*
 * PALETA "LARANJA LINEAR" — degradê na diagonal (135°) na palavra-chave; o resto do
 * texto fica branco.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {
    type: "degrade",
    angle: 135,
    stops: [
      {color: "#FFD27A", position: 0},
      {color: "#FF9A3C", position: 50},
      {color: "#F2542D", position: 100},
    ],
  },

  // Brilho #FF7A1A, na mesma intensidade das outras paletas.
  glow: {inner: "rgba(255,122,26,.55)", outer: "rgba(255,122,26,.3)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G
  brilhoLinear: {l1: "rgba(255,122,26,.95)", l2: "rgba(255,122,26,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
