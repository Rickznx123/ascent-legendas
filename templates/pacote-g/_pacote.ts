import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE G — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 */
const pacote: PackageConfig = {
  // Linear: até 3 palavras numa linha (linear-1); 4 ou 5 em duas (linear-2), 3 em cima
  // e o resto embaixo. Mais de 5 palavras divide o bloco pelas penalidades do agrupador.
  linear: "linear-2",
  linearCurto: {maxPalavras: 3, template: "linear-1"},
  maxLinearWords: 5,
  highlight: [
    // Curto (2 a 4 palavras, até 18 caracteres): tudo numa linha.
    {words: {min: 2, max: 4}, maxCaracteres: 18, templates: ["g4"]},
    // Algo depois da palavra-chave: a parte de depois na linha de baixo.
    {after: {min: 1}, templates: ["g1"]},
    // Três ou mais antes e nada depois: grande e pequena em cima.
    {before: {min: 3}, after: {max: 0}, templates: ["g2"]},
    // Uma ou duas antes e nada depois: serifa em cima, chave embaixo.
    {before: {min: 1, max: 2}, after: {max: 0}, templates: ["g3"]},
    // Os demais casos.
    {templates: ["g1", "g2"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["g1"],
  // A paleta do vídeo ao escolher o pacote G.
  paleta: "prata-g",
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "o medo de fracassar", palavraChave: "medo"},
};

export default pacote;
