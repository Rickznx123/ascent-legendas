import type {PackageConfig} from "../../src/types";
import agrupamento from "./_agrupamento";
import {CARACTERES_POR_LINHA} from "./_estilos";

/*
 * REGRAS DO PACOTE H (CLÁSSICO) — legenda estilo Netflix pintada no tempo da fala.
 * Ritmo comum (linear, linear, destaque; nunca dois destaques seguidos). O linear é
 * o H1 (H2 e H3 são escolhidos à mão); os destaques alternam H4, H5 e H6, com as
 * palavras antes da chave em cima e as de depois embaixo (até 4 por linha).
 */
const DESTAQUES = ["h4", "h5", "h6"];

const pacote: PackageConfig = {
  nome: "Clássico",
  linear: "h1",
  maxLinearWords: 5,
  // Duas linhas de 24 caracteres.
  maxLinearCaracteres: 2 * CARACTERES_POR_LINHA + 1,
  highlight: [{templates: DESTAQUES}],
  // Mesma lista: a alternância continua entre a junção e os demais destaques.
  threeLines: DESTAQUES,
  agrupamento,
  exemplo: {texto: "de uma legenda que prende atenção.", palavraChave: "legenda"},
};

export default pacote;
