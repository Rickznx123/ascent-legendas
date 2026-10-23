import {layout} from "./_estilos";

/*
 * LINEAR EM 2 LINHAS — "depois de ter / terminado tudo"
 * Montserrat 700, duas palavras embaixo e o resto em cima (2 e 2 ou 3 e 2); a segunda linha com 86% e
 * começando mais à esquerda (a de cima recuada .32em). Bloco com 64% da largura
 * (letra de até 13%).
 */
export default layout({
  arranjo: "linear-duas-linhas",
  ajuste: {targetWidthPercent: 64, maxFontPercent: 13},
  linhas: [{recuoEm: 0.32, estilo: {marginLeft: ".32em"}}, {escala: 0.86, estilo: {marginTop: ".06em"}}],
});
