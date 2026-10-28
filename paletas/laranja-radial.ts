import type {Palette} from "../src/types";

/*
 * PALETA "LARANJA RADIAL" — degradê do centro da palavra-chave para fora; o resto do
 * texto fica branco.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {
    type: "radial",
    stops: [
      {color: "#FFE3A8", position: 0},
      {color: "#FF8A2B", position: 50},
      {color: "#D9431A", position: 100},
    ],
  },

  // Brilho #FF7A1A, na mesma intensidade das outras paletas.
  glow: {inner: "rgba(255,122,26,.55)", outer: "rgba(255,122,26,.3)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G
  brilhoLinear: {l1: "rgba(255,122,26,.95)", l2: "rgba(255,122,26,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
