import type {CaptionTemplate} from "../../src/types";
import {ENTRADA_IMOBILIARIO} from "../../src/imobiliario-config";

/*
 * PACOTE C — estilo "imobiliário" (referencia.html).
 * O desenho todo (grupo acima da cabeça e na altura do tronco, apoio fino e chave
 * enorme, entrada com motion blur, saída para cima) está em src/imobiliario.tsx,
 * com os parâmetros da prancha. Os layouts só dizem a estrutura: os estilos daqui
 * não são usados pelo desenho, só pelas regras comuns (ritmo e tempos de entrada).
 */
export const IMOBILIARIO_BASE: Omit<CaptionTemplate, "family"> = {
  structure: "imobiliario",
  keywordEffect: "sombra",
  keywordPaint: "recorte",
  styles: {block: {}},
  animations: {word: ENTRADA_IMOBILIARIO, keyword: ENTRADA_IMOBILIARIO},
};
