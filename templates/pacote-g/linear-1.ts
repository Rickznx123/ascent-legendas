import {LINEAR, layout} from "./_estilos";

/*
 * LINEAR EM 1 LINHA — "dois amigos goianos"
 * O mesmo estilo do linear de 2 linhas, numa linha só (espaçamento -.035em), até 3
 * palavras. Bloco com 88% da largura (letra de até 16%).
 */
export default layout({
  arranjo: "linear-uma-linha",
  ajuste: {targetWidthPercent: 88, maxFontPercent: 16},
  estilos: {linear: {...LINEAR, letterSpacing: "-.035em"}},
});
