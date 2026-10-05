import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE B — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 */
const pacote: PackageConfig = {
  linear: "linear",
  highlight: [
    // Uma palavra só: só a palavra-chave gigante.
    {words: {max: 1}, templates: ["b4"]},
    // Duas palavras de apoio em cima, nada depois.
    {before: {min: 2, max: 2}, after: {max: 0}, templates: ["b4"]},
    // Duas palavras de apoio em cima e complemento embaixo.
    {before: {min: 2, max: 2}, after: {min: 1}, templates: ["b2"]},
    // Duas linhas antes da palavra-chave (3+ palavras antes), nada depois.
    {before: {min: 3}, after: {max: 0}, templates: ["b3", "b5"]},
    // Apoio em cima e embaixo (os demais casos).
    {templates: ["b1", "b6"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["b1", "b6"],
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "cuidar de você é prioridade", palavraChave: "prioridade"},
};

export default pacote;
