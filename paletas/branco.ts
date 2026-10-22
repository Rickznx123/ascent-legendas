import type {Palette} from "../src/types";

/*
 * PALETA "BRANCO" — igual a templates/pacote-a/referencia.html.
 * Texto branco, palavra-chave branca, brilho branco e sombra preta.
 */
const palette: Palette = {
  // Apoio, complemento e texto linear.
  supportColor: "#ffffff",

  // Palavra-chave. Para degradê, veja paletas/vermelho.ts.
  keywordFill: {type: "solida", color: "#ffffff"},

  // Brilho da palavra-chave: perto da letra e espalhado. Intensidade 1 = referência.
  glow: {inner: "rgba(255,255,255,.55)", outer: "rgba(255,255,255,.28)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (o brilho desta paleta, mais forte)
  brilhoLinear: {l1: "rgba(255,255,255,.95)", l2: "rgba(255,255,255,.55)"},

  // Sombra de todo o texto.
  shadow: {color: "#000000"},
};

export default palette;
