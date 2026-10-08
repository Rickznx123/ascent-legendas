import type {CaptionTemplate} from "../../src/types";
import {BLOCO, ESTILO_SANS, LUGAR, SAIDA, sobe} from "./_estilos";

/*
 * LINEAR DO PACOTE F
 * Só a sans, branca, com espaçamento negativo, numa linha (até 3 palavras ou 20
 * caracteres; acima disso, o ritmo a divide em mais blocos lineares), 28 px na
 * prancha. Cada palavra sobe suave, com um desfoque leve, no instante da fala.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {
      ...BLOCO,
      ...ESTILO_SANS,
      display: "block",
      fontSize: `${(28 * 100) / 360}cqw`,
    },
  },
  animations: {word: sobe(28), keyword: sobe(28)},
  linhaUnica: true,
  posicao: LUGAR,
  saida: SAIDA,
};

export default template;
