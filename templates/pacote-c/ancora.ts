import {layoutImobiliario} from "./_estilos";

/*
 * C — ÂNCORA EM CIMA, TRILHO EMBAIXO (na altura do tronco)
 * A âncora (começo da frase) cai palavra por palavra e fica; as palavras seguintes
 * passam pelo trilho logo abaixo, entrando pela esquerda e saindo pela direita.
 */
export default layoutImobiliario("destaque", {papel: "cena", ordem: "ancora-trilho", trilhoEntra: "esquerda", chavesNaAncora: 1, altura: "tronco"});
