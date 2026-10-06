import type {CaptionTemplate} from "../../src/types";
import {IMOBILIARIO_BASE} from "./_estilos";

/*
 * LINEAR DO PACOTE C
 * O mesmo desenho do destaque: no pacote C, todo bloco é imobiliário. Existe à parte
 * só porque o ritmo comum (dois lineares e um destaque) pede um layout linear.
 */
const template: CaptionTemplate = {...IMOBILIARIO_BASE, family: "linear"};

export default template;
