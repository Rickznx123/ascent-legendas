import {layout} from "./_estilos";

/*
 * G3 — SERIFA EM CIMA, CHAVE EMBAIXO
 * Serifa itálica recuada (letra de 70%), descendo por cima do topo da palavra-chave
 * pesada. Bloco com 50% da largura (letra de até 15%).
 */
export default layout({
  arranjo: "serifa-em-cima",
  ajuste: {targetWidthPercent: 50, maxFontPercent: 15},
  linhas: [{escala: 0.7, recuoEm: 0.55, estilo: {margin: "0 0 -.48em .55em", position: "relative", zIndex: 2}}, {espacoEm: 0.1}],
});
