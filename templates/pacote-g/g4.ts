import {layout} from "./_estilos";

/*
 * G4 — LINHA ÚNICA MISTA
 * Pesada, serifa itálica (82%) e palavra-chave pesada na mesma linha de base.
 * Bloco com 54% da largura (letra de até 11%).
 */
export default layout({
  arranjo: "linha-mista",
  ajuste: {targetWidthPercent: 54, maxFontPercent: 11},
  tamanhos: {"serifa-branca": 0.82},
  linhas: [{espacoEm: 0.12}],
});
