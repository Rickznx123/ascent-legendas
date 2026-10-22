import type {Palette} from "../src/types";

/*
 * PALETA "FOGO" — prancha do pacote C, versão 2 (templates/pacote-c/referencia.html).
 * Três cores: destaque #FFB21F, caixa #D9361A e texto da caixa #FFFFFF; o
 * resto do texto fica branco. Nos outros pacotes, vale a cor de destaque (palavra-chave
 * e brilho); a caixa só aparece no pacote C.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {type: "solida", color: "#FFB21F"},

  // Brilho na cor de destaque.
  glow: {inner: "rgba(255,178,31,.65)", outer: "rgba(255,178,31,.35)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (o brilho desta paleta, mais forte)
  brilhoLinear: {l1: "rgba(255,178,31,.95)", l2: "rgba(255,178,31,.55)"},

  shadow: {color: "#000000"},

  caixa: {fundo: "#D9361A", texto: "#FFFFFF"},
};

export default palette;
