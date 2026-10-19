import type {Palette} from "../src/types";

/*
 * PALETA "AMARELO-LEGENDA" — templates/pacote-h/referencia.html (H1 · Amarelo).
 * Texto e palavra-chave no amarelo clássico de legenda, sombra preta.
 */
const palette: Palette = {
  supportColor: "#FFD84D",
  keywordFill: {type: "solida", color: "#FFD84D"},
  glow: {inner: "rgba(255,216,77,.55)", outer: "rgba(255,216,77,.28)", intensity: 1},
  shadow: {color: "#000000"},
};

export default palette;
