// Tempos de tela das legendas: a entrada de cada palavra começa antes da fala,
// para ela já estar legível quando é falada. Funções puras: o render, a prévia,
// a lista de blocos e os efeitos sonoros usam os mesmos tempos.
import {Easing} from "remotion";
import {AGRUPAMENTO_CONFIG} from "./agrupamento-config";
import {findKeywordIndex} from "./captions";
import {encaixarNoAudio} from "./encaixe";
import type {
  AssignedCaptionBlock,
  CaptionBlock,
  CaptionTemplate,
  EntranceAnimation,
  SincroniaPrecisa,
  VozDoAudio,
} from "./types";

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
const cacheDaPrecisa = new WeakMap<EntranceAnimation, number>();

// Tempo, desde o início da animação, até a palavra ficar VISIVEL_NA_FALA visível
// (opacidade; o desfoque e o deslocamento seguem a mesma curva).
// Com a Sincronia precisa (precisa), uma animação com quadros-chave de opacidade
// (a piscada) só conta depois do último trecho abaixo de VISIVEL_NA_FALA, quando
// volta a 100%: a piscada inteira acontece antes da fala, a palavra está em 100%
// no quadro em que é falada e não cai mais abaixo de VISIVEL_NA_FALA depois.
export const antecipacaoDaEntradaMs = (animation: EntranceAnimation, precisa = false): number => {
  const piscada = precisa && Boolean(animation.keyframes?.opacity);
  const memoria = piscada ? cacheDaPrecisa : cache;
  const salvo = memoria.get(animation);
  if (salvo !== undefined) {
    return salvo;
  }
  const ease = Easing.bezier(...animation.easing);
  const passos = Math.max(1, Math.round(animation.durationMs));
  let ms = animation.durationMs;
  if (piscada) {
    // Último instante abaixo de VISIVEL_NA_FALA; depois dele, o primeiro em 100%.
    let ultimoAbaixo = -1;
    for (let passo = 0; passo <= passos; passo++) {
      if (opacidadeEm(animation, passo / passos, ease) < VISIVEL_NA_FALA) {
        ultimoAbaixo = passo;
      }
    }
    for (let passo = ultimoAbaixo + 1; passo <= passos; passo++) {
      if (opacidadeEm(animation, passo / passos, ease) >= 0.999) {
        ms = (passo / passos) * animation.durationMs;
        break;
      }
    }
  } else {
    for (let passo = 0; passo <= passos; passo++) {
      const t = passo / passos;
      const progresso = animation.keyframes?.opacity ? 1 : ease(t);
      if (opacidadeEm(animation, t, ease) >= VISIVEL_NA_FALA && progresso >= VISIVEL_NA_FALA) {
        ms = t * animation.durationMs;
        break;
      }
    }
  }
  ms += MARGEM_DE_QUADRO_MS;
  memoria.set(animation, ms);
  return ms;
};

// Entrada mais rápida (Sincronia precisa): quando o bloco entrou com antecedência
// reduzida (a troca de blocos sem silêncio, veja src/tempos.ts), a palavra começa a
// entrar mais tarde que o previsto e a animação é acelerada para ela ainda estar
// VISIVEL_NA_FALA visível no quadro em que é falada. Nunca mais rápida que
// ESCALA_MINIMA_DA_ENTRADA da duração original.
const ESCALA_MINIMA_DA_ENTRADA = 0.15;

export const entradaAjustada = (
  animation: EntranceAnimation,
  startMs: number,
  faladaMs: number | undefined,
): EntranceAnimation => {
  if (faladaMs === undefined) {
    return animation;
  }
  const antecipacao = antecipacaoDaEntradaMs(animation, true);
  const disponivel = faladaMs - startMs;
  // Folga de 1 ms para o arredondamento do início.
  if (disponivel >= antecipacao - 1) {
    return animation;
  }
  if (animation.keyframes?.opacity) {
    // A piscada não cabe antes da fala: vira um aparecer simples, rápido o bastante
    // para estar VISIVEL_NA_FALA visível no quadro da fala (no mínimo um quadro),
    // em vez de piscar depois de falada.
    return {
      ...animation,
      keyframes: undefined,
      easing: [0, 0, 1, 1],
      fromOpacity: 0,
      durationMs: Math.max(1000 / 30, (disponivel - MARGEM_DE_QUADRO_MS) / VISIVEL_NA_FALA),
    };
  }
  const escala = Math.max(
    ESCALA_MINIMA_DA_ENTRADA,
    (disponivel - MARGEM_DE_QUADRO_MS) / (antecipacao - MARGEM_DE_QUADRO_MS),
  );
  return {...animation, durationMs: animation.durationMs * escala};
};

// Animação de entrada de cada palavra do bloco (a palavra-chave tem a dela).
export const animacaoDaPalavra = (block: AssignedCaptionBlock, template: CaptionTemplate, indice: number): EntranceAnimation => {
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
  precisa?: SincroniaPrecisa,
): number[] =>
  blocosNaTela((excluidos ?? []) as AssignedCaptionBlock[], templates, sincroniaMs, precisa)
    .map((block) => block.startMs)
    .sort((a, b) => a - b);

// Sincronia do projeto, ou a padrão da configuração.
export const sincroniaDoProjeto = (salva: number | undefined): number =>
  salva ?? AGRUPAMENTO_CONFIG.sincroniaMs;

// Sincronia precisa do projeto (vazio: desligada), com a voz do áudio salva nele.
export const precisaoDoProjeto = (projeto: {
  sincroniaPrecisa?: boolean;
  voz?: VozDoAudio;
} | undefined): SincroniaPrecisa | undefined => (projeto?.sincroniaPrecisa ? {voz: projeto.voz} : undefined);

// Palavras de todos os blocos encaixadas juntas na voz (o encaixe olha as vizinhas,
// mesmo de outro bloco), devolvidas a cada bloco.
const encaixarBlocos = (blocks: AssignedCaptionBlock[], voz: VozDoAudio): AssignedCaptionBlock[] => {
  const {palavras} = encaixarNoAudio(blocks.flatMap((block) => block.words), voz);
  let proxima = 0;
  return blocks.map((block) => {
    const words = palavras.slice(proxima, proxima + block.words.length);
    proxima += block.words.length;
    return {...block, words};
  });
};

// Blocos com os tempos de tela: cada palavra começa a entrar antes da fala o
// suficiente para estar legível nela, e tudo anda sincroniaMs (positivo atrasa,
// negativo adianta). O fim das palavras só anda com a sincronia.
// Com a Sincronia precisa, as palavras antes grudam na voz do áudio (src/encaixe.ts).
export const blocosNaTela = (
  blocks: AssignedCaptionBlock[],
  templates: Record<string, CaptionTemplate>,
  sincroniaMs = 0,
  precisa?: SincroniaPrecisa,
): AssignedCaptionBlock[] =>
  (precisa?.voz ? encaixarBlocos(blocks, precisa.voz) : blocks).map((block) => {
    const template = templates[block.template];
    const words = block.words.map((word, indice) => {
      const antecipacao = template ? antecipacaoDaEntradaMs(animacaoDaPalavra(block, template, indice), Boolean(precisa)) : 0;
      return {
        ...word,
        startMs: Math.max(0, Math.round(word.startMs - antecipacao + sincroniaMs)),
        endMs: Math.max(0, word.endMs + sincroniaMs),
        // Com a Sincronia precisa, a troca de blocos e a entrada acelerada precisam
        // saber quando a palavra é falada.
        ...(precisa ? {faladaMs: Math.max(0, word.startMs + sincroniaMs)} : {}),
      };
    });
    return {
      ...block,
      words,
      startMs: Math.min(...words.map((word) => word.startMs)),
      // Com o encaixe, o bloco termina onde a última palavra termina agora.
      endMs: Math.max(0, (precisa?.voz ? block.words[block.words.length - 1].endMs : block.endMs) + sincroniaMs),
    };
  });
