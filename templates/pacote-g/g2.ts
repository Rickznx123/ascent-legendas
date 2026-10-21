import {layout} from "./_estilos";

/*
 * G2 — "só uma coisa / torna um sonho"
 * Em cima, a primeira palavra pesada e o resto pesado com 56%, na mesma linha de base.
 * Embaixo, começando um pouco à esquerda: serifa itálica (78%) e a palavra-chave
 * pesada (112%). Bloco com 70% da largura (letra de até 16%).
 */
export default layout({
  arranjo: "grande-e-pequena",
  ajuste: {targetWidthPercent: 70, maxFontPercent: 16},
  tamanhos: {"pesada-pequena": 0.56, "serifa-branca": 0.78, chave: 1.12},
  linhas: [
    {recuoEm: 0.16, estilo: {marginLeft: ".16em"}, espacoEm: 0.08},
    {estilo: {marginTop: "-.16em"}, espacoEm: 0.1},
  ],
});
