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

  shadow: {color: "#000000"},
};

export default palette;
