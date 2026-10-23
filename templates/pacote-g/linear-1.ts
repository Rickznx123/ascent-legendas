import {LINEAR, layout} from "./_estilos";

/*
 * LINEAR EM 1 LINHA — "dois amigos goianos"
 * O mesmo estilo do linear de 2 linhas, numa linha só (espaçamento -.035em), até 3
 * palavras. Bloco com 66% da largura (letra de até 12%).
 */
export default layout({
  arranjo: "linear-uma-linha",
  ajuste: {targetWidthPercent: 66, maxFontPercent: 12},
  estilos: {linear: {...LINEAR, letterSpacing: "-.035em"}},
});
