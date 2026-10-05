import type {Palette} from "../src/types";

/*
 * PALETA "ROSE" — body.rose de templates/pacote-d/referencia.html.
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(180deg, #ffe3ea 0%, #ff8fb1 55%, #e0457b 100%)
  keywordFill: {
    type: "degrade",
    angle: 180,
    stops: [
      {color: "#ffe3ea", position: 0},
      {color: "#ff8fb1", position: 55},
      {color: "#e0457b", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(255,110,160,.6)", outer: "rgba(255,70,130,.35)", intensity: 1},

  shadow: {color: "#000000"},
};

export default palette;
