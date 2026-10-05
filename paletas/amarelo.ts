import type {Palette} from "../src/types";

/*
 * PALETA "AMARELO" — body.amarelo de templates/pacote-b/referencia.html.
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #fff2a8 0%, #ffc21a 55%, #ff9d00 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#fff2a8", position: 0},
      {color: "#ffc21a", position: 55},
      {color: "#ff9d00", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(255,190,40,.6)", outer: "rgba(255,150,0,.35)", intensity: 1},

  shadow: {color: "#000000"},
};

export default palette;
