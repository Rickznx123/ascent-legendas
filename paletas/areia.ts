import type {Palette} from "../src/types";

/*
 * PALETA "AREIA" — body.areia de templates/pacote-d/referencia.html (dois tons na horizontal).
 * Pinta só a palavra-chave e o brilho; o resto do texto fica branco.
 */
const palette: Palette = {
  supportColor: "#ffffff",

  // --chave: linear-gradient(90deg, #cdb696 0%, #d6c2a4 46%, #ffffff 62%, #ffffff 100%)
  keywordFill: {
    type: "degrade",
    angle: 90,
    stops: [
      {color: "#cdb696", position: 0},
      {color: "#d6c2a4", position: 46},
      {color: "#ffffff", position: 62},
      {color: "#ffffff", position: 100},
    ],
  },

  // --g1 e --g2
  glow: {inner: "rgba(255,236,205,.4)", outer: "rgba(255,225,180,.2)", intensity: 1},

  shadow: {color: "#000000"},
};

export default palette;
