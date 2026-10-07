// Estrutura "papeis" (pacote C): como as palavras de um destaque viram até 3 linhas,
// cada parte com um papel (etiqueta, destaque, gigante, corpo, leve, mini). Funções
// puras: o render (KineticCaptionVideo) e os tempos de entrada (src/entrada.ts)
// usam a mesma divisão.
import type {ArranjoDosPapeis, Papel} from "./types";

// Uma parte de uma linha: um papel e as palavras (índices no bloco).
export type ParteDaLinha = {papel: Papel; palavras: number[]};
export type LinhaDosPapeis = {partes: ParteDaLinha[]};

const intervalo = (de: number, ate: number): number[] => Array.from({length: Math.max(0, ate - de)}, (_, i) => de + i);
const parte = (papel: Papel, palavras: number[]): ParteDaLinha[] => (palavras.length > 0 ? [{papel, palavras}] : []);
const linhas = (...lista: ParteDaLinha[][]): LinhaDosPapeis[] => lista.filter((partes) => partes.length > 0).map((partes) => ({partes}));

// Quantas palavras do começo vão para a etiqueta (1 ou 2), deixando pelo menos uma
// palavra antes da palavra-chave fora dela quando houver 3 ou mais.
const tamanhoDaEtiqueta = (antes: number): number => (antes <= 1 ? antes : antes === 2 ? 1 : 2);

// Linhas do arranjo para n palavras com a palavra-chave em k.
export const linhasDosPapeis = (arranjo: ArranjoDosPapeis, n: number, k: number): LinhaDosPapeis[] => {
  const chave = Math.min(Math.max(0, k), n - 1);
  const depois = intervalo(chave + 1, n);

  if (arranjo === "gigante") {
    // Apoio branco com a etiqueta na última palavra antes da chave, a chave gigante e
    // o fecho leve.
    const antes = intervalo(0, chave);
    return linhas(
      [...parte("corpo", antes.slice(0, -1)), ...parte("etiqueta", antes.slice(-1))],
      parte("gigante", [chave]),
      parte("leve", depois),
    );
  }

  if (chave === 0) {
    // Palavra-chave primeiro: sem etiqueta; a chave na cor e o resto embaixo.
    return arranjo === "miudinho" && depois.length >= 2
      ? linhas(parte("destaque", [0]), [...parte("mini", depois.slice(0, -1)), ...parte("corpo", depois.slice(-1))])
      : linhas(parte("destaque", [0]), parte("corpo", depois));
  }

  const etiqueta = intervalo(0, tamanhoDaEtiqueta(chave));
  if (arranjo === "pilha") {
    // Etiqueta, corpo (até a chave) e a linha na cor (da chave ao fim).
    return linhas(parte("etiqueta", etiqueta), parte("corpo", intervalo(etiqueta.length, chave)), parte("destaque", intervalo(chave, n)));
  }

  // Miudinho: etiqueta, a linha na cor (o que vem entre a etiqueta e a chave, mais a
  // chave) e, embaixo, os conectivos miúdos empilhados ao lado da última palavra.
  return linhas(
    parte("etiqueta", etiqueta),
    parte("destaque", intervalo(etiqueta.length, chave + 1)),
    depois.length >= 2 ? [...parte("mini", depois.slice(0, -1)), ...parte("corpo", depois.slice(-1))] : parte("corpo", depois),
  );
};

// A linha é só a etiqueta (ela abre da esquerda para a direita em vez de subir).
export const soEtiqueta = (linha: LinhaDosPapeis): boolean => linha.partes.length === 1 && linha.partes[0].papel === "etiqueta";

// Linha de cada palavra (para a entrada: todas as palavras de uma linha entram juntas).
export const linhaDeCadaPalavra = (todas: LinhaDosPapeis[], n: number): number[] => {
  const resultado = Array<number>(n).fill(0);
  todas.forEach((linha, indice) => linha.partes.forEach((p) => p.palavras.forEach((palavra) => (resultado[palavra] = indice))));
  return resultado;
};
