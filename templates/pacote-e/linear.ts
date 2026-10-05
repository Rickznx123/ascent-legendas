import type {CaptionTemplate} from "../../src/types";
import {BLOCO, CIMA, DE_BAIXO, DE_DIR, DE_ESQ} from "./_estilos";

/*
 * LINEAR DO PACOTE E
 * Respiro entre os destaques: sans itálica de 8,4%, uma linha só, sem
 * palavra-chave pintada. As palavras sobem uma a uma; com duas palavras, uma vem
 * de cada lado. Nunca quebra linha.
 */
const template: CaptionTemplate = {
  family: "linear",
  structure: "linear",
  keywordEffect: "sombra",
  styles: {
    block: {...BLOCO, ...CIMA, fontSize: "8.4cqw"},
  },
  animations: {word: DE_BAIXO, keyword: DE_BAIXO, linearPair: [DE_ESQ, DE_DIR]},
};

export default template;
