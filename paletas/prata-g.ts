import type {Palette} from "../src/types";

/*
 * PALETA "PRATA G" — body.prata de templates/pacote-g/referencia.html (padrão do
 * pacote G). A palavra-chave tem o mesmo degradê metálico das pesadas.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: var(--metal) = linear-gradient(180deg, #ffffff 0%, #ffffff 42%, #c3c3cb 100%)
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
  glow: {inner: "rgba(255,255,255,.35)", outer: "rgba(200,205,255,.18)", intensity: 1},

  // --l1 e --l2: glow do linear
  brilhoLinear: {l1: "rgba(225,228,255,.95)", l2: "rgba(150,160,255,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
