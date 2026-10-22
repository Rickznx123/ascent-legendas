import type {Palette} from "../src/types";

/*
 * PALETA "NEON" — prancha do pacote C, versão 2 (templates/pacote-c/referencia.html).
 * Três cores: destaque #EFFF1A, caixa #D7141A e texto da caixa #FFFFFF; o
 * resto do texto fica branco. Nos outros pacotes, vale a cor de destaque (palavra-chave
 * e brilho); a caixa só aparece no pacote C.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {type: "solida", color: "#EFFF1A"},

  // Brilho na cor de destaque.
  glow: {inner: "rgba(239,255,26,.65)", outer: "rgba(239,255,26,.35)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (o brilho desta paleta, mais forte)
  brilhoLinear: {l1: "rgba(239,255,26,.95)", l2: "rgba(239,255,26,.55)"},

  shadow: {color: "#000000"},

  caixa: {fundo: "#D7141A", texto: "#FFFFFF"},
};

export default palette;
