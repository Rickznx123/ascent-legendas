import {layoutImobiliario} from "./_estilos";

/*
 * C — TRILHO EM CIMA, ÂNCORA EMBAIXO (na altura do tronco)
 * O trilho passa acima da âncora; a âncora sobe de baixo para o lugar.
 */
export default layoutImobiliario("destaque", {papel: "cena", ordem: "trilho-ancora", trilhoEntra: "esquerda", chavesNaAncora: 1, altura: "tronco"});
