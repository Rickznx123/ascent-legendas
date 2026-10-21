import {layout} from "./_estilos";

/*
 * G4 — LINHA ÚNICA MISTA
 * Pesada, serifa itálica (90%) e palavra-chave pesada na mesma linha de base.
 * Bloco com 72% da largura (letra de até 15%).
 */
export default layout({
  arranjo: "linha-mista",
  ajuste: {targetWidthPercent: 72, maxFontPercent: 15},
  tamanhos: {"serifa-branca": 0.9},
  linhas: [{espacoEm: 0.12}],
});
