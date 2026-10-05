// Tempos de tela das legendas: a entrada de cada palavra começa antes da fala,
// para ela já estar legível quando é falada. Funções puras: o render, a prévia,
// a lista de blocos e os efeitos sonoros usam os mesmos tempos.
import {Easing} from "remotion";
import {AGRUPAMENTO_CONFIG} from "./agrupamento-config";
import {findKeywordIndex} from "./captions";
import type {AssignedCaptionBlock, CaptionBlock, CaptionTemplate, EntranceAnimation} from "./types";

// Quanto a palavra precisa estar visível no instante em que é falada (0 a 1).
const VISIVEL_NA_FALA = 0.7;

// Folga de um quadro (a 30 fps): o quadro na tela no instante da fala começou
// até 33 ms antes dela, e é ele que precisa estar VISIVEL_NA_FALA visível.
const MARGEM_DE_QUADRO_MS = 35;

// Opacidade da animação no ponto t (0 a 1), como em AnimatedWord.
const opacidadeEm = (animation: EntranceAnimation, t: number, ease: (value: number) => number): number => {
  const frames = animation.keyframes?.opacity;
  if (!frames) {
    return animation.fromOpacity + (1 - animation.fromOpacity) * ease(t);
  }
  for (let index = 1; index < frames.length; index++) {
    const [offset, value] = frames[index];
    const [previousOffset, previousValue] = frames[index - 1];
    if (t <= offset) {
      const local = offset === previousOffset ? 1 : (t - previousOffset) / (offset - previousOffset);
      return previousValue + (value - previousValue) * ease(local);
    }
  }
  return frames[frames.length - 1][1];
};

const cache = new WeakMap<EntranceAnimation, number>();

// Tempo, desde o início da animação, até a palavra ficar VISIVEL_NA_FALA visível
// (opacidade; o desfoque e o deslocamento seguem a mesma curva).
export const antecipacaoDaEntradaMs = (animation: EntranceAnimation): number => {
  const salvo = cache.get(animation);
  if (salvo !== undefined) {
    return salvo;
  }
  const ease = Easing.bezier(...animation.easing);
  const passos = Math.max(1, Math.round(animation.durationMs));
  let ms = animation.durationMs;
  for (let passo = 0; passo <= passos; passo++) {
    const t = passo / passos;
    const progresso = animation.keyframes?.opacity ? 1 : ease(t);
    if (opacidadeEm(animation, t, ease) >= VISIVEL_NA_FALA && progresso >= VISIVEL_NA_FALA) {
      ms = t * animation.durationMs;
      break;
    }
  }
  ms += MARGEM_DE_QUADRO_MS;
  cache.set(animation, ms);
  return ms;
};

// Animação de entrada de cada palavra do bloco (a palavra-chave tem a dela).
const animacaoDaPalavra = (block: AssignedCaptionBlock, template: CaptionTemplate, indice: number): EntranceAnimation => {
  const {animations} = template;
  if (template.structure === "linear") {
    return block.words.length === 2 && animations.linearPair ? animations.linearPair[indice] : animations.word;
  }
  return indice === findKeywordIndex(block.words, block.keyword) ? animations.keyword : animations.word;
};

// Instantes de tela em que entrava cada bloco excluído (com a antecipação da
// entrada e a sincronia): o bloco anterior sai ali, como saía antes da exclusão,
// sem esticar sobre o tempo do excluído.
export const cortesDosExcluidos = (
  excluidos: CaptionBlock[] | undefined,
  templates: Record<string, CaptionTemplate>,
  sincroniaMs = 0,
): number[] =>
  blocosNaTela((excluidos ?? []) as AssignedCaptionBlock[], templates, sincroniaMs)
    .map((block) => block.startMs)
    .sort((a, b) => a - b);

// Sincronia do projeto, ou a padrão da configuração.
export const sincroniaDoProjeto = (salva: number | undefined): number =>
  salva ?? AGRUPAMENTO_CONFIG.sincroniaMs;

// Blocos com os tempos de tela: cada palavra começa a entrar antes da fala o
// suficiente para estar legível nela, e tudo anda sincroniaMs (positivo atrasa,
// negativo adianta). O fim das palavras só anda com a sincronia.
export const blocosNaTela = (
  blocks: AssignedCaptionBlock[],
  templates: Record<string, CaptionTemplate>,
  sincroniaMs = 0,
): AssignedCaptionBlock[] =>
  blocks.map((block) => {
    const template = templates[block.template];
    const words = block.words.map((word, indice) => {
      const antecipacao = template ? antecipacaoDaEntradaMs(animacaoDaPalavra(block, template, indice)) : 0;
      return {
        ...word,
        startMs: Math.max(0, Math.round(word.startMs - antecipacao + sincroniaMs)),
        endMs: Math.max(0, word.endMs + sincroniaMs),
      };
    });
    return {
      ...block,
      words,
      startMs: Math.min(...words.map((word) => word.startMs)),
      endMs: Math.max(0, block.endMs + sincroniaMs),
    };
  });
