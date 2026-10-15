import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE G — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 */
const pacote: PackageConfig = {
  linear: "linear",
  // Linear de até 3 palavras, numa linha só.
  maxLinearWords: 3,
  highlight: [
    // Uma palavra só: só a palavra-chave.
    {words: {max: 1}, templates: ["g4"]},
    // Linha curta (2 a 4 palavras, até 22 caracteres): tudo numa linha.
    {words: {min: 2, max: 4}, maxCaracteres: 22, templates: ["g7"]},
    // Duas palavras de apoio em cima, nada depois.
    {before: {min: 2, max: 2}, after: {max: 0}, templates: ["g1", "g2"]},
    // Três ou mais antes, nada depois: pilha à esquerda.
    {before: {min: 3}, after: {max: 0}, templates: ["g3"]},
    // Algo depois da palavra-chave: complemento embaixo à direita.
    {after: {min: 1}, templates: ["g6"]},
    // Os demais casos.
    {templates: ["g1", "g5"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["g6"],
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "existe um propósito real", palavraChave: "propósito"},
};

export default pacote;
