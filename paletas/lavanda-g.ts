import type {Palette} from "../src/types";

/*
 * PALETA "LAVANDA G" — body.lavanda de templates/pacote-g/referencia.html. A palavra-chave
 * tem o degradê metálico; o brilho é lavanda. O glow do linear é o mesmo da prata.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: var(--metal)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#ffffff", position: 0},
      {color: "#ffffff", position: 42},
      {color: "#c3c3cb", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(200,205,255,.6)", outer: "rgba(130,140,255,.35)", intensity: 1},

  // --l1 e --l2 (os do :root da referência)
  brilhoLinear: {l1: "rgba(225,228,255,.95)", l2: "rgba(150,160,255,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
