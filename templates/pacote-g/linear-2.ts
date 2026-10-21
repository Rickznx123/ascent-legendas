import {layout} from "./_estilos";

/*
 * LINEAR EM 2 LINHAS — "depois de ter / terminado o mandato"
 * Montserrat 600 apertada; a segunda linha com 74% e começando mais à esquerda (a de
 * cima recuada .32em). Conectivos curtos no meio da linha com 40%. A quebra segue as
 * penalidades do agrupador. Bloco com 70% da largura (letra de até 13%).
 */
export default layout({
  arranjo: "linear-duas-linhas",
  ajuste: {targetWidthPercent: 70, maxFontPercent: 13},
  linhas: [{recuoEm: 0.32, estilo: {marginLeft: ".32em"}}, {escala: 0.74, estilo: {marginTop: ".02em"}}],
});
