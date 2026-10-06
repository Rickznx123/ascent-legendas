import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE C — estilo imobiliário.
 * Um desenho só para todos os blocos (veja src/imobiliario.tsx); as regras abaixo só
 * cumprem o ritmo comum. Blocos curtos: no imobiliário, cada bloco ocupa a tela em
 * dois grupos, então o linear é dividido acima de 6 palavras.
 */
const pacote: PackageConfig = {
  linear: "linear",
  highlight: [{templates: ["imobiliario"]}],
  threeLines: ["imobiliario"],
  maxLinearWords: 6,
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "casa para viver em Alphaville", palavraChave: "Alphaville"},
  // Projetos salvos com o desenho antigo do pacote C passam a usar o novo.
  aliases: {c1: "imobiliario", c2: "imobiliario", c3: "imobiliario", c4: "imobiliario", c5: "imobiliario", c6: "imobiliario"},
};

export default pacote;
