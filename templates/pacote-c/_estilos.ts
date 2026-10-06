import type {CaptionTemplate, ConfigImobiliario, TemplateFamily} from "../../src/types";
import {ENTRADA_IMOBILIARIO} from "../../src/imobiliario-config";

/*
 * PACOTE C — estilo "imobiliário" (referencia.html).
 * O desenho todo (âncora e trilho, apoio fino e chave enorme, entrada com motion
 * blur, saída para cima) está em src/imobiliario.tsx, com os parâmetros da prancha
 * em src/imobiliario-config.ts. Cada layout só diz o papel e a variação; os estilos
 * daqui não desenham nada, só servem às regras comuns (ritmo e tempos de entrada).
 */
export const layoutImobiliario = (family: TemplateFamily, imobiliario: ConfigImobiliario): CaptionTemplate => ({
  family,
  structure: "imobiliario",
  keywordEffect: "sombra",
  keywordPaint: "recorte",
  styles: {block: {}},
  animations: {word: ENTRADA_IMOBILIARIO, keyword: ENTRADA_IMOBILIARIO},
  imobiliario,
});
