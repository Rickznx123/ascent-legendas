import {ESPACO, layout} from "./_estilos";

/*
 * G1 — "o medo / de fracassar"
 * Linha pesada com as palavras antes e a palavra-chave. Embaixo, recuada e encostando
 * nela: conectivo pesado (46%) e serifa itálica (92%). Bloco com 66% da largura do
 * vídeo (letra de até 20%).
 */
export default layout({
  arranjo: "chave-e-serifa",
  ajuste: {targetWidthPercent: 66, maxFontPercent: 20},
  tamanhos: {conectivo: 0.46, "serifa-branca": 0.92},
  linhas: [{espacoEm: ESPACO}, {recuoEm: 0.42, estilo: {margin: "-.3em 0 0 .42em"}, espacoEm: 0.1}],
});
