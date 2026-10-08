import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE F (editorial) — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 *
 * Ritmo (o mesmo do pacote C): dinâmicos nas frases fortes, lineares entre eles.
 * O primeiro bloco do vídeo é dinâmico, nunca há dois dinâmicos seguidos e no
 * máximo 3 lineares seguidos. O linear tem até 3 palavras ou 20 caracteres; passou
 * disso, vira mais de um bloco linear, e cada pedaço conta nos 3.
 */
const pacote: PackageConfig = {
  linear: "linear",
  maxLinearWords: 3,
  maxLinearCaracteres: 20,
  ritmo: {maxLinearesSeguidos: 3, primeiroDestaque: true},
  highlight: [
    // Uma palavra só: o destaque gigante.
    {words: {max: 1}, templates: ["gigante"]},
    // Depois da chave, artigos e preposições e uma palavra forte: os dois destaques com o elo.
    {eloDepois: true, templates: ["dois-destaques"]},
    // Palavra-chave no começo: o destaque gigante, com a sans embaixo.
    {before: {max: 0}, templates: ["gigante"]},
    // Até uma palavra depois da chave: na linha e sans em cima, alternados.
    {after: {max: 1}, templates: ["na-linha", "sans-em-cima"]},
    // Duas ou mais depois da chave: sans em cima e o gigante.
    {templates: ["sans-em-cima", "gigante"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["gigante"],
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "o app faz tudo em segundos", palavraChave: "tudo"},
};

export default pacote;
