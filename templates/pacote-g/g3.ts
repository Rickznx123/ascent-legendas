import {layout} from "./_estilos";

/*
 * G3 — SERIFA EM CIMA, CHAVE EMBAIXO
 * Serifa itálica recuada (letra de 80%), encostando no topo da palavra-chave pesada.
 * Bloco com 66% da largura (letra de até 20%).
 */
export default layout({
  arranjo: "serifa-em-cima",
  ajuste: {targetWidthPercent: 66, maxFontPercent: 20},
  linhas: [{escala: 0.8, recuoEm: 0.55, estilo: {margin: "0 0 -.3em .55em"}}, {espacoEm: 0.1}],
});
