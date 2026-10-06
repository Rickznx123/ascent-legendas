import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE C — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 */
const pacote: PackageConfig = {
  linear: "linear",
  highlight: [
    // Uma palavra só: alterna a pilha (só a chave) e a manuscrita gigante.
    {words: {max: 1}, templates: ["c3", "c4"]},
    // Duas palavras de apoio em cima, nada depois.
    {before: {min: 2, max: 2}, after: {max: 0}, templates: ["c4"]},
    // Duas palavras de apoio em cima e complemento embaixo.
    {before: {min: 2, max: 2}, after: {min: 1}, templates: ["c2"]},
    // Duas linhas antes da palavra-chave (3+ palavras antes), nada depois.
    {before: {min: 3}, after: {max: 0}, templates: ["c3", "c5"]},
    // Apoio em cima e embaixo (os demais casos).
    {templates: ["c1", "c6"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["c1", "c6"],
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "um resultado natural que dura", palavraChave: "natural"},
};

export default pacote;
