import type {Palette} from "../src/types";

/*
 * PALETA "CIANO" — :root de templates/pacote-g/referencia.html (padrão do pacote G).
 * Letra branca, palavra-chave branca puxando para o ciano e brilho ciano em volta.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #ffffff 0%, #ffffff 55%, #d9f6ff 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#ffffff", position: 0},
      {color: "#ffffff", position: 55},
      {color: "#d9f6ff", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(70,200,255,.95)", outer: "rgba(20,110,255,.55)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (os de body.ciano de templates/pacote-g/referencia.html)
  brilhoLinear: {l1: "rgba(150,225,255,.95)", l2: "rgba(30,130,255,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
