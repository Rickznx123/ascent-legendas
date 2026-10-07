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

  shadow: {color: "#000000"},

  caixa: {fundo: "#D9361A", texto: "#FFFFFF"},
};

export default palette;
