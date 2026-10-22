import {layout} from "./_estilos";

/*
 * G3 — SERIFA EM CIMA, CHAVE EMBAIXO
 * Serifa itálica recuada (letra de 70%), descendo por cima do topo da palavra-chave
 * pesada. Bloco com 66% da largura (letra de até 20%).
 */
export default layout({
  arranjo: "serifa-em-cima",
  ajuste: {targetWidthPercent: 66, maxFontPercent: 20},
  linhas: [{escala: 0.7, recuoEm: 0.55, estilo: {margin: "0 0 -.48em .55em", position: "relative", zIndex: 2}}, {espacoEm: 0.1}],
});
