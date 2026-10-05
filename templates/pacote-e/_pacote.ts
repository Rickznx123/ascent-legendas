import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE E — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 */
const pacote: PackageConfig = {
  linear: "linear",
  highlight: [
    // Uma palavra só: só a palavra-chave gigante.
    {words: {max: 1}, templates: ["e4"]},
    // Duas palavras de apoio em cima, nada depois.
    {before: {min: 2, max: 2}, after: {max: 0}, templates: ["e4"]},
    // Duas palavras de apoio em cima e complemento embaixo.
    {before: {min: 2, max: 2}, after: {min: 1}, templates: ["e2"]},
    // Duas linhas antes da palavra-chave (3+ palavras antes), nada depois.
    {before: {min: 3}, after: {max: 0}, templates: ["e3", "e5"]},
    // Apoio em cima e embaixo (os demais casos).
    {templates: ["e1", "e6"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["e1", "e6"],
  // O linear tem de 2 a 3 palavras e não quebra linha: um linear maior é dividido.
  maxLinearWords: 3,
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "um tratamento feito para você", palavraChave: "tratamento"},
};

export default pacote;
