import type {CaptionTemplate} from "../../src/types";
import {IMOBILIARIO_BASE} from "./_estilos";

/*
 * C — IMOBILIÁRIO (destaque)
 * Grupo de cima cai de cima, palavra por palavra; grupo de baixo entra alternando
 * (um bloco dos lados, o seguinte de baixo). Saída para cima, em cascata.
 */
const template: CaptionTemplate = {...IMOBILIARIO_BASE, family: "destaque"};

export default template;
