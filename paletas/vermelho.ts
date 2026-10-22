import type {Palette} from "../src/types";

/*
 * PALETA "VERMELHO" — body.vermelho de templates/pacote-b/referencia.html.
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #ff3b2f 0%, #c40d0d 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#ff3b2f", position: 0},
      {color: "#c40d0d", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(255,40,30,.75)", outer: "rgba(255,0,0,.45)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (os de body.vermelho de templates/pacote-g/referencia.html)
  brilhoLinear: {l1: "rgba(255,150,140,.95)", l2: "rgba(220,30,20,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
