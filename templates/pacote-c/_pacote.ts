import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE C (versão 2) — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 *
 * Ritmo: dinâmicos nas frases fortes, lineares entre eles. O primeiro bloco do
 * vídeo é dinâmico, nunca há dois dinâmicos seguidos e no máximo 3 lineares
 * seguidos. O linear tem até 3 palavras ou 20 caracteres; passou disso, vira mais
 * de um bloco linear, e cada pedaço conta nos 3.
 */
const pacote: PackageConfig = {
  linear: "linear",
  maxLinearWords: 3,
  maxLinearCaracteres: 20,
  ritmo: {maxLinearesSeguidos: 3, primeiroDestaque: true},
  highlight: [
    // Uma palavra só: o destaque gigante.
    {words: {max: 1}, templates: ["gigante"]},
    // Duas ou três palavras depois da chave: o miudinho (conectivos ao lado da última).
    {before: {min: 1, max: 3}, after: {min: 2, max: 3}, templates: ["miudinho"]},
    // Etiqueta antes da chave e até duas palavras depois: as pilhas e o gigante.
    {before: {min: 1}, after: {max: 2}, templates: ["pilha-esquerda", "gigante", "pilha-central"]},
    // Os demais (palavra-chave no começo): o gigante.
    {templates: ["gigante"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["gigante"],
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "se você é personal trainer online", palavraChave: "trainer"},
};

export default pacote;
