import {layout} from "./_estilos";

/*
 * LINEAR EM 2 LINHAS — "depois de ter / terminado tudo"
 * Montserrat 700, até 3 palavras em cima e o resto embaixo; a segunda linha com 86% e
 * começando mais à esquerda (a de cima recuada .32em). Bloco com 86% da largura
 * (letra de até 18%).
 */
export default layout({
  arranjo: "linear-duas-linhas",
  ajuste: {targetWidthPercent: 86, maxFontPercent: 18},
  linhas: [{recuoEm: 0.32, estilo: {marginLeft: ".32em"}}, {escala: 0.86, estilo: {marginTop: ".06em"}}],
});
