import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE D — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 */
const pacote: PackageConfig = {
  linear: "linear",
  highlight: [
    // Uma palavra só: chave gigante com piscada.
    {words: {max: 1}, templates: ["d4"]},
    // Duas palavras antes, nada depois: rótulo de uma linha e chave com piscada.
    {before: {min: 2, max: 2}, after: {max: 0}, templates: ["d4"]},
    // Duas palavras antes e algo depois: dois rótulos e apoio embaixo.
    {before: {min: 2, max: 2}, after: {min: 1}, templates: ["d2"]},
    // Três ou mais antes, nada depois: pilhas, alternando esquerda e direita.
    {before: {min: 3}, after: {max: 0}, templates: ["d3", "d5"]},
    // Os demais: apoio em cima e embaixo.
    {templates: ["d1"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["d1"],
  // Dois blocos curtos e próximos na tela juntos (valores em agrupamento-config.ts).
  dupla: "d6",
  // O linear tem de 2 a 3 palavras e não quebra linha: um linear maior é dividido.
  maxLinearWords: 3,
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "sua autoestima em primeiro lugar", palavraChave: "autoestima"},
};

export default pacote;
