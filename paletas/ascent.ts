import type {Palette} from "../src/types";

/*
 * PALETA "ASCENT" — prancha do pacote C, versão 2 (templates/pacote-c/referencia.html).
 * Três cores: destaque #FF4FD8, caixa #6A3DFF e texto da caixa #FFFFFF; o
 * resto do texto fica branco. Nos outros pacotes, vale a cor de destaque (palavra-chave
 * e brilho); a caixa só aparece no pacote C.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {type: "solida", color: "#FF4FD8"},

  // Brilho na cor de destaque.
  glow: {inner: "rgba(255,79,216,.65)", outer: "rgba(255,79,216,.35)", intensity: 1},

  shadow: {color: "#000000"},

  caixa: {fundo: "#6A3DFF", texto: "#FFFFFF"},
};

export default palette;
