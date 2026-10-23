import {layout} from "./_estilos";

/*
 * G2 — "só uma coisa / torna um sonho"
 * Em cima, a primeira palavra pesada e o resto pesado com 60%, na mesma linha de base.
 * Embaixo, começando um pouco à esquerda e subindo sobre a de cima: serifa itálica
 * (76%) e a palavra-chave pesada (112%). Bloco com 52% da largura (letra de até 12%).
 */
export default layout({
  arranjo: "grande-e-pequena",
  ajuste: {targetWidthPercent: 52, maxFontPercent: 12},
  tamanhos: {"pesada-pequena": 0.6, "serifa-branca": 0.76, chave: 1.12},
  linhas: [
    {recuoEm: 0.16, estilo: {marginLeft: ".16em"}, espacoEm: 0.08},
    {estilo: {marginTop: "-.34em", position: "relative"}, espacoEm: 0.1},
  ],
});
