import type {PackageConfig} from "../../src/types";

/*
 * REGRAS DO PACOTE C — estilo imobiliário (âncora e trilho).
 * Um destaque abre a cena (âncora + trilho, veja src/imobiliario.tsx); os lineares
 * do rodízio que vêm depois dele passam pelo trilho. Linear fora de uma cena (antes
 * do primeiro destaque, ou escolhido à mão) usa o desenho linear do C.
 */
const pacote: PackageConfig = {
  linear: "linear",
  highlight: [
    // Bloco curto: grupo único central, sem trilho.
    {words: {max: 2}, templates: ["unico"]},
    // Os demais: as variações da cena, em rodízio.
    {templates: ["ancora", "trilho-direita", "trilho-em-cima", "ancora-dupla"]},
  ],
  threeLines: ["ancora"],
  maxLinearWords: 6,
  // Texto das miniaturas da galeria quando nenhum bloco está selecionado.
  exemplo: {texto: "se você quer ganhar uma casa nova", palavraChave: "casa"},
  // Nomes de layouts que saíram: projetos salvos com eles usam o desenho novo.
  aliases: {
    imobiliario: "ancora",
    c1: "ancora",
    c2: "trilho-direita",
    c3: "ancora",
    c4: "unico",
    c5: "ancora-dupla",
    c6: "trilho-em-cima",
  },
};

export default pacote;
