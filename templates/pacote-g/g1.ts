import {layout} from "./_estilos";

/*
 * G1 — "o medo / de fracassar"
 * Linha pesada com as palavras antes e a palavra-chave. Embaixo, recuada e subindo
 * sobre ela (por cima): conectivo pesado (46%) e serifa itálica (84%). Bloco com 66%
 * da largura do vídeo (letra de até 20%). O espaço de cima (.28em) é o espaço solto
 * entre os spans da referência, na Montserrat 700 do bloco.
 */
export default layout({
  arranjo: "chave-e-serifa",
  ajuste: {targetWidthPercent: 66, maxFontPercent: 20},
  tamanhos: {conectivo: 0.46, "serifa-branca": 0.84},
  linhas: [{espacoEm: 0.28}, {recuoEm: 0.42, estilo: {margin: "-.5em 0 0 .42em", position: "relative", zIndex: 2}, espacoEm: 0.1}],
});
