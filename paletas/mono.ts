import type {Palette} from "../src/types";

/*
 * PALETA "MONO" — prancha do pacote C, versão 2 (templates/pacote-c/referencia.html).
 * Três cores: destaque #FFFFFF, caixa #FFFFFF e texto da caixa #0B0B0B; o
 * resto do texto fica branco. Nos outros pacotes, vale a cor de destaque (palavra-chave
 * e brilho); a caixa só aparece no pacote C.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {type: "solida", color: "#FFFFFF"},

  // Brilho na cor de destaque.
  glow: {inner: "rgba(255,255,255,.65)", outer: "rgba(255,255,255,.35)", intensity: 1},

  shadow: {color: "#000000"},

  caixa: {fundo: "#FFFFFF", texto: "#0B0B0B"},
};

export default palette;
