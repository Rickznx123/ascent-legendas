import type {Palette} from "../src/types";

/*
 * PALETA "MENTA" — prancha do pacote C, versão 2 (templates/pacote-c/referencia.html).
 * Três cores: destaque #5CFFB0, caixa #0E7C55 e texto da caixa #FFFFFF; o
 * resto do texto fica branco. Nos outros pacotes, vale a cor de destaque (palavra-chave
 * e brilho); a caixa só aparece no pacote C.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {type: "solida", color: "#5CFFB0"},

  // Brilho na cor de destaque.
  glow: {inner: "rgba(92,255,176,.65)", outer: "rgba(92,255,176,.35)", intensity: 1},

  shadow: {color: "#000000"},

  caixa: {fundo: "#0E7C55", texto: "#FFFFFF"},
};

export default palette;
