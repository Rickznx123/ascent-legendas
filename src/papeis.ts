// Estrutura "papeis" (pacote C): como as palavras de um destaque viram até 3 linhas,
// cada parte com um papel (etiqueta, destaque, gigante, corpo, leve, mini). Funções
// puras: o render (KineticCaptionVideo) e os tempos de entrada (src/entrada.ts)
// usam a mesma divisão.
import {isStrongWord, normalizeForKeyword} from "./captions";
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

// Artigos e preposições (com as contrações), os únicos que viram o elo miúdo.
const ARTIGOS_E_PREPOSICOES = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "num", "numa",
  "ao", "aos", "para", "pra", "pro", "pras", "pros", "por", "pelo", "pela", "pelos", "pelas",
  "com", "sem", "entre", "ate", "sob", "sobre", "contra", "desde", "apos", "perante",
]);

// Artigo ou preposição sem pontuação depois (uma vírgula fecha a frase).
const ehElo = (texto: string): boolean => !/[,;:.!?…]["')\]]*$/u.test(texto) && ARTIGOS_E_PREPOSICOES.has(normalizeForKeyword(texto));

// Pacote F: depois da palavra-chave, só artigos e preposições (um ou dois) e uma
// última palavra forte, como "tudo em segundos".
export const temEloDepois = (textos: string[], k: number): boolean => {
  const depois = textos.slice(k + 1);
  const ultima = depois[depois.length - 1] ?? "";
  return depois.length >= 2 && depois.length <= 3 && isStrongWord(ultima) && !ehElo(ultima) && depois.slice(0, -1).every(ehElo);
};

// Pacote F: palavras em serifa; artigos e preposições entre duas palavras em
// serifa viram o elo miúdo.
const serifaComElo = (palavras: number[], textos: string[] | undefined): ParteDaLinha[] => {
  const noMeio = (posicao: number) =>
    posicao > 0 && posicao < palavras.length - 1 && ehElo(textos?.[palavras[posicao]] ?? "");
  const partes: ParteDaLinha[] = [];
  palavras.forEach((palavra, posicao) => {
    const papel: Papel = noMeio(posicao) ? "elo" : "serifa";
    const ultima = partes[partes.length - 1];
    if (ultima?.papel === papel) {
      ultima.palavras.push(palavra);
    } else {
      partes.push({papel, palavras: [palavra]});
    }
  });
  return partes;
};

// Linhas do arranjo para n palavras com a palavra-chave em k. textos (as palavras
// do bloco) só são usados pelos arranjos do pacote F, para achar os elos.
export const linhasDosPapeis = (arranjo: ArranjoDosPapeis, n: number, k: number, textos?: string[]): LinhaDosPapeis[] => {
  const chave = Math.min(Math.max(0, k), n - 1);
  const depois = intervalo(chave + 1, n);
  const antesDaChave = intervalo(0, chave);

  if (arranjo === "na-linha") {
    // Sans e destaque na mesma linha; o destaque continua em serifa embaixo.
    return linhas([...parte("sans", antesDaChave), ...parte("serifa", [chave])], serifaComElo(depois, textos));
  }
  if (arranjo === "dois-destaques") {
    // Sans pequena em cima; a palavra-chave e o resto em serifa, com os elos miúdos.
    return linhas(parte("sans-pequena", antesDaChave), serifaComElo([chave, ...depois], textos));
  }
  if (arranjo === "serifa-gigante") {
    return linhas(parte("sans-pequena", antesDaChave), parte("serifa-gigante", [chave]), parte("sans-pequena", depois));
  }
  if (arranjo === "sans-em-cima") {
    return linhas([...parte("sans", antesDaChave), ...parte("serifa", [chave])], parte("sans-grande", depois));
  }

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

// Papel de cada palavra (pacote F: cada palavra entra com a animação do seu papel).
export const papelDeCadaPalavra = (todas: LinhaDosPapeis[], n: number): (Papel | undefined)[] => {
  const resultado = Array<Papel | undefined>(n).fill(undefined);
  todas.forEach((linha) => linha.partes.forEach((p) => p.palavras.forEach((palavra) => (resultado[palavra] = p.papel))));
  return resultado;
};

// Linha de cada palavra (para a entrada: todas as palavras de uma linha entram juntas).
export const linhaDeCadaPalavra = (todas: LinhaDosPapeis[], n: number): number[] => {
  const resultado = Array<number>(n).fill(0);
  todas.forEach((linha, indice) => linha.partes.forEach((p) => p.palavras.forEach((palavra) => (resultado[palavra] = indice))));
  return resultado;
};
