import type {Palette} from "../src/types";

/*
 * PALETA "MENTA SUAVE" — prancha do pacote F (templates/pacote-f/referencia.html).
 * Sans branca, serifa #CFF8E6 e brilho rgba(120,240,190,.5).
 * Papéis da cor em cada pacote:
 *   F       a sans fica branca; a cor vai na serifa e no elo, e o brilho na serifa.
 *   C       a cor vai no destaque e no gigante; sem caixa própria, a etiqueta usa a
 *           cor de fundo e o texto escuro; o corpo e o linear ficam brancos.
 *   A/B/D/E a cor vai na palavra-chave, com o brilho; apoio e linear brancos.
 */
const palette: Palette = {
  supportColor: "#FFFFFF",

  keywordFill: {type: "solida", color: "#CFF8E6"},

  // Brilho da prancha perto da letra; o espalhado, com metade da força.
  glow: {inner: "rgba(120,240,190,.5)", outer: "rgba(120,240,190,.25)", intensity: 1},

  // --l1 e --l2: glow do linear do pacote G (o brilho desta paleta, mais forte)
  brilhoLinear: {l1: "rgba(120,240,190,.95)", l2: "rgba(120,240,190,.55)"},

  shadow: {color: "#000000"},
};

export default palette;
