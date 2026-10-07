import type {Palette} from "../src/types";

/*
 * PALETA "OCEANO" — prancha do pacote C, versão 2 (templates/pacote-c/referencia.html).
 * Três cores: destaque #3DE0FF, caixa #0B4DDB e texto da caixa #FFFFFF; o
 * resto do texto fica branco. Nos outros pacotes, vale a cor de destaque (palavra-chave
 * e brilho); a caixa só aparece no pacote C.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {type: "solida", color: "#3DE0FF"},

  // Brilho na cor de destaque.
  glow: {inner: "rgba(61,224,255,.65)", outer: "rgba(61,224,255,.35)", intensity: 1},

  shadow: {color: "#000000"},

  caixa: {fundo: "#0B4DDB", texto: "#FFFFFF"},
};

export default palette;
