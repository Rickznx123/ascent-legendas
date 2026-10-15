import type {CaptionTemplate} from "../../src/types";
import {ACENDE, BLOCO, FORTE, KW, ROTULO, SOBE, SOMBRA, TX} from "./_estilos";

/*
 * G5 — ETIQUETA COM LINHAS
 * Apoio em caixa-alta espaçada entre dois traços finos brilhantes, no estilo de
 * rótulo de comercial. Palavra-chave com 66% da largura (teto 24%).
 */
const template: CaptionTemplate = {
  family: "destaque",
  structure: "etiqueta",
  keywordEffect: "brilho",
  keywordPaint: "recorte",
  styles: {
    block: BLOCO,
    support: {
      ...ROTULO,
      display: "flex",
      alignItems: "center",
      gap: ".5em",
      justifyContent: "center",
      marginBottom: ".4em",
    },
    // .et::before e .et::after
    traco: {height: ".3cqw", width: "9cqw", background: "currentColor", borderRadius: 1, boxShadow: SOMBRA},
    keywordOuter: KW,
    keyword: {...TX, ...FORTE},
  },
  keywordFit: {targetWidthPercent: 66, maxFontPercent: 24},
  animations: {word: SOBE, keyword: ACENDE},
};

export default template;
