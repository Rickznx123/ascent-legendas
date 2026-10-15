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

  shadow: {color: "#000000"},
};

export default palette;
