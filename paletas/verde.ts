import type {Palette} from "../src/types";

/*
 * PALETA "VERDE" — body.verde de templates/pacote-d/referencia.html.
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #eaffb0 0%, #9dff3a 50%, #37c400 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#eaffb0", position: 0},
      {color: "#9dff3a", position: 50},
      {color: "#37c400", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(140,255,60,.55)", outer: "rgba(70,220,0,.3)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (o brilho desta paleta, mais forte)
  brilhoLinear: {l1: "rgba(140,255,60,.95)", l2: "rgba(70,220,0,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
