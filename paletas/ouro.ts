import type {Palette} from "../src/types";

/*
 * PALETA "OURO" — prancha do pacote C, versão 2 (templates/pacote-c/referencia.html).
 * Três cores: destaque #FFD166, caixa #FFD166 e texto da caixa #17130A; o
 * resto do texto fica branco. Nos outros pacotes, vale a cor de destaque (palavra-chave
 * e brilho); a caixa só aparece no pacote C.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {type: "solida", color: "#FFD166"},

  // Brilho na cor de destaque.
  glow: {inner: "rgba(255,209,102,.65)", outer: "rgba(255,209,102,.35)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (o brilho desta paleta, mais forte)
  brilhoLinear: {l1: "rgba(255,209,102,.95)", l2: "rgba(255,209,102,.55)"},

  shadow: {color: "#000000"},

  caixa: {fundo: "#FFD166", texto: "#17130A"},
};

export default palette;
