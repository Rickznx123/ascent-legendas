import type {TemplateFamily} from "./types";

/*
 * Ritmo comum a todos os pacotes. Qual layout usar em cada situação fica em
 * templates/pacote-<nome>/_pacote.ts.
 */
export const RHYTHM_CONFIG: {
  pattern: TemplateFamily[];
  maxWordsInThreeLines: number;
} = {
  // Em cada ciclo, no máximo um destaque. Destaques nunca ficam seguidos.
  pattern: ["linear", "linear", "destaque"],

  // Máximo de palavras quando um destaque é juntado com o bloco seguinte.
  maxWordsInThreeLines: 6,
};
