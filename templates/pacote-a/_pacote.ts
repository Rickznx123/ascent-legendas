import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE A — qual layout usar em cada situação.
 * As regras de destaque são testadas em ordem; vale a primeira que combinar.
 * "before" e "after" contam as palavras antes e depois da palavra-chave.
 * Com mais de um template na lista, eles se alternam entre os blocos.
 */
const pacote: PackageConfig = {
  linear: "layout-6",
  highlight: [
    // Uma palavra só.
    {words: {max: 1}, templates: ["layout-5"]},
    // Expressão protegida, ex.: "depilação a laser".
    {protectedExpression: true, templates: ["layout-4"]},
    // Palavras depois da chave ("Tem NOVIDADE chegando").
    {after: {min: 1}, templates: ["layout-2"]},
    // 3 ou mais palavras antes da chave ("Não perca essa OPORTUNIDADE").
    {before: {min: 3}, templates: ["layout-3"]},
    // 1 ou 2 palavras antes da chave ("lidar com IRRITAÇÕES").
    {templates: ["layout-1"]},
  ],
  // Junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: ["layout-7"],
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "o segredo de uma pele saudável", palavraChave: "segredo"},
};

export default pacote;
