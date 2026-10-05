import {AGRUPAMENTO_CONFIG} from "./agrupamento-config";
import {findKeywordIndex} from "./captions";
import type {AssignedCaptionBlock} from "./types";

// Quando cada bloco aparece e some na tela.
export type BlockTiming = {
  showMs: number;
  hideMs: number;
};

// O bloco gostaria de ficar na tela até wanted. Até quando ele fica e quando o
// bloco seguinte pode entrar (atrasado no máximo atrasoMaximoDoSeguinteMs).
const holdUntil = (
  wanted: number,
  lastWordEndMs: number,
  nextStartMs: number,
): {hideMs: number; nextShowMs: number} => {
  const {permanenciaMaximaMs, atrasoMaximoDoSeguinteMs} = AGRUPAMENTO_CONFIG.tempos;
  const nextShowMs =
    wanted > nextStartMs ? Math.min(wanted, nextStartMs + atrasoMaximoDoSeguinteMs) : nextStartMs;
  return {hideMs: Math.min(nextShowMs, lastWordEndMs + permanenciaMaximaMs), nextShowMs};
};

// Com a palavra-chave entrando em keywordEntryMs, até quando o bloco fica na
// tela e quando o bloco seguinte pode entrar.
export const keywordHold = (
  keywordEntryMs: number,
  lastWordEndMs: number,
  nextStartMs: number,
): {hideMs: number; nextShowMs: number} =>
  holdUntil(keywordEntryMs + AGRUPAMENTO_CONFIG.tempos.chaveVisivelMinimaMs, lastWordEndMs, nextStartMs);

// A palavra-chave fica visível tempo suficiente? (usado para trocar de palavra-chave)
export const keywordStaysVisible = (
  keywordStartMs: number,
  lastWordEndMs: number,
  nextStartMs: number,
): boolean =>
  keywordHold(keywordStartMs, lastWordEndMs, nextStartMs).hideMs - keywordStartMs >=
  AGRUPAMENTO_CONFIG.tempos.chaveVisivelAceitavelMs;

// Tempo mínimo na tela de um bloco curto que foi empurrado pelo anterior.
const MIN_BLOCK_VISIBLE_MS = 200;

// Sincronia precisa: a última palavra do bloco fica na tela pelo menos isto depois
// de começar a ser falada (ou até o fim dela, se for mais curta).
const ULTIMA_PALAVRA_NA_TELA_MS = 200;
// Sem silêncio entre os blocos, o seguinte entra no máximo isto antes da primeira
// palavra dele (2 quadros a 30 fps), com a entrada acelerada (entradaAjustada).
const ANTECEDENCIA_REDUZIDA_MS = 2000 / 30;

// Troca de blocos da Sincronia precisa, em ordem de prioridade:
// 1. nenhuma palavra sai da tela antes de ser falada;
// 2. a última palavra fica ULTIMA_PALAVRA_NA_TELA_MS depois de começar a ser falada
//    (ou até o fim dela, o que for menor);
// 3. com silêncio entre os blocos (o seguinte, com a antecedência normal, só entra
//    depois do fim da voz), o atual fica até ele entrar;
// 4. sem silêncio, o seguinte entra com antecedência reduzida, depois do mínimo do 2.
// Devolve até quando o bloco fica e quando o seguinte entra.
const trocaPrecisa = (
  block: AssignedCaptionBlock,
  next: AssignedCaptionBlock | undefined,
): {hideMs: number; nextShowMs: number; minHideMs: number} => {
  const last = block.words[block.words.length - 1];
  const lastSpokenMs = last.faladaMs ?? last.startMs;
  const minHideMs = lastSpokenMs + Math.min(ULTIMA_PALAVRA_NA_TELA_MS, Math.max(0, last.endMs - lastSpokenMs));
  if (!next) {
    return {hideMs: Math.max(minHideMs, last.endMs + AGRUPAMENTO_CONFIG.tempos.permanenciaMaximaMs), nextShowMs: Infinity, minHideMs};
  }
  const nextSpokenMs = next.words[0].faladaMs ?? next.words[0].startMs;
  const nextShowMs =
    next.startMs >= last.endMs
      ? next.startMs
      : Math.max(minHideMs, next.startMs, nextSpokenMs - ANTECEDENCIA_REDUZIDA_MS);
  return {
    hideMs: Math.max(minHideMs, Math.min(nextShowMs, last.endMs + AGRUPAMENTO_CONFIG.tempos.permanenciaMaximaMs)),
    nextShowMs,
    minHideMs,
  };
};

// Blocos que ficam menos que tempoMinimoDeTelaMs na tela, mesmo com o atraso.
export const shortBlockIndexes = (blocks: AssignedCaptionBlock[]): number[] =>
  computeTimeline(blocks)
    .map((timing, index) => (timing.hideMs - timing.showMs < AGRUPAMENTO_CONFIG.tempos.tempoMinimoDeTelaMs ? index : -1))
    .filter((index) => index >= 0);

// Linha do tempo de exibição: cada bloco fica até o início do seguinte (no máximo
// permanenciaMaximaMs depois da última palavra). O seguinte pode entrar mais tarde
// para o bloco cumprir tempoMinimoDeTelaMs e, num destaque, para a palavra-chave
// ficar visível chaveVisivelMinimaMs.
// cortesMs: instantes em que começavam blocos excluídos. O bloco antes de um corte
// sai no corte (não estica para cobrir o tempo do bloco que foi excluído).
export const computeTimeline = (blocks: AssignedCaptionBlock[], cortesMs: number[] = []): BlockTiming[] => {
  const {tempoMinimoDeTelaMs, chaveVisivelMinimaMs} = AGRUPAMENTO_CONFIG.tempos;
  const timeline: BlockTiming[] = [];
  let showMs = blocks[0]?.startMs ?? 0;

  // Sincronia precisa: os blocos de blocosNaTela trazem o instante falado de cada palavra.
  const precisa = blocks[0]?.words[0]?.faladaMs !== undefined;

  blocks.forEach((block, index) => {
    showMs = Math.max(showMs, block.startMs);
    if (precisa) {
      const troca = trocaPrecisa(block, blocks[index + 1]);
      let {hideMs, nextShowMs} = troca;
      // Bloco excluído no meio: este sai no corte, mas nunca antes da regra 2.
      const corte = cortesMs.find((c) => c > block.startMs && c < hideMs);
      if (corte !== undefined) {
        hideMs = Math.max(troca.minHideMs, corte);
      }
      if (hideMs < showMs + MIN_BLOCK_VISIBLE_MS) {
        hideMs = showMs + MIN_BLOCK_VISIBLE_MS;
        nextShowMs = Math.max(nextShowMs, hideMs);
      }
      timeline.push({showMs, hideMs});
      showMs = nextShowMs;
      return;
    }
    const lastWordEndMs = block.words[block.words.length - 1]?.endMs ?? block.endMs;
    const nextStartMs = Math.min(
      blocks[index + 1]?.startMs ?? Number.POSITIVE_INFINITY,
      ...cortesMs.filter((corte) => corte > block.startMs),
    );

    let wanted = showMs + tempoMinimoDeTelaMs;
    if (block.family === "destaque") {
      const keyword = block.words[findKeywordIndex(block.words, block.keyword)];
      wanted = Math.max(wanted, Math.max(keyword.startMs, showMs) + chaveVisivelMinimaMs);
    }
    let {hideMs, nextShowMs} = holdUntil(wanted, lastWordEndMs, nextStartMs);

    // Um bloco empurrado pelo anterior nunca some sem aparecer.
    if (hideMs < showMs + MIN_BLOCK_VISIBLE_MS) {
      hideMs = showMs + MIN_BLOCK_VISIBLE_MS;
      nextShowMs = Math.max(nextShowMs, hideMs);
    }

    timeline.push({showMs, hideMs});
    showMs = nextShowMs;
  });

  // Dupla: o primeiro bloco continua na tela até o segundo sair; os dois saem juntos.
  blocks.forEach((block, index) => {
    if (block.dupla === "primeiro" && blocks[index + 1]?.dupla === "segundo") {
      timeline[index] = {...timeline[index], hideMs: timeline[index + 1].hideMs};
    }
  });

  return timeline;
};

// Índice do bloco na tela no instante currentMs (ou -1).
export const findActiveBlockIndex = (timeline: BlockTiming[], currentMs: number): number =>
  timeline.findIndex((timing) => currentMs >= timing.showMs && currentMs < timing.hideMs);
