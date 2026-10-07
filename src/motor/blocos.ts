// Edições de blocos. Funções puras (sem Node): servem ao terminal e à interface.
import {chooseKeyword, findKeywordIndex, groupWords, normalizeForKeyword} from "../captions";
import {assignMixed, assignRhythmAndTemplates, layoutForKeywordIn, linearCabe} from "../rhythm";
import type {PackageRules} from "../rhythm";
import {shortBlockIndexes} from "../tempos";
import type {AssignedCaptionBlock, CaptionBlock, CaptionTemplate, Word} from "../types";
import type {Estilo} from "./projeto";

// Valor do seletor de pacote para o modo misto (sorteia entre todos os pacotes).
export const PACOTE_MISTO = "misto";

// Semente nova para o sorteio do modo misto (não usa Math.random).
export const novaSemente = (): number => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];

// Regras do pacote de um bloco: o pacote sorteado (misto) ou o pacote do vídeo.
export const rulesForBlock = (estilo: Estilo, block: CaptionBlock): PackageRules =>
  estilo.pacotes[block.pacote ?? ""] ?? estilo.pacotes[estilo.pacote] ?? Object.values(estilo.pacotes)[0];

// Escolhe os layouts de todos os blocos com o estilo atual. No modo misto, sorteia
// os pacotes com a semente. Blocos com layout escolhido à mão ficam como estão.
export const assignForStyle = (
  blocks: CaptionBlock[],
  estilo: Estilo,
  options: {semente?: number; preserveAssignments?: boolean; templateChoice?: string} = {},
): AssignedCaptionBlock[] => {
  const preserveAssignments = options.preserveAssignments ?? false;
  const assigned =
    estilo.pacote === PACOTE_MISTO
      ? assignMixed(blocks, Object.values(estilo.pacotes), options.semente ?? novaSemente(), {
          preserveAssignments,
          templateChoice: options.templateChoice,
        })
      : assignRhythmAndTemplates(blocks, estilo.pacotes[estilo.pacote].templates, estilo.pacotes[estilo.pacote].config, {
          preserveAssignments,
          templateChoice: options.templateChoice,
          packageName: estilo.pacotes[estilo.pacote].name,
        });
  return markLongLinears(assigned, estilo);
};

// Layouts do pacote C antigo (c1 a c6, trocados pelo C versão 2 em 07/10/2026).
const LAYOUT_DO_C_ANTIGO = /^(c\/)?c[1-6]$/u;

// O projeto ainda usa layouts do pacote C antigo?
export const temPacoteCAntigo = (blocks: CaptionBlock[]): boolean => blocks.some((block) => LAYOUT_DO_C_ANTIGO.test(block.template ?? ""));

// Passa um projeto do pacote C antigo para o novo: os layouts são escolhidos de novo
// com o ritmo e os layouts do C versão 2 (no modo misto, com a mesma semente). Os
// blocos de outros pacotes escolhidos à mão continuam como estão.
export const migrarPacoteC = (projeto: {blocks: CaptionBlock[]; semente?: number}, estilo: Estilo): AssignedCaptionBlock[] =>
  assignForStyle(
    projeto.blocks.map((block) => (LAYOUT_DO_C_ANTIGO.test(block.template ?? "") ? {...block, layoutManual: undefined} : block)),
    estilo,
    {semente: projeto.semente ?? 0, preserveAssignments: true},
  );

// Linear acima do máximo de palavras (ou de caracteres) do pacote que não foi dividido (layout escolhido
// à mão ou blocos salvos mantidos como estão): só fica marcado como "revisar".
const markLongLinears = (blocks: AssignedCaptionBlock[], estilo: Estilo): AssignedCaptionBlock[] =>
  blocks.map((block) => {
    const config = block.family === "linear" ? rulesForBlock(estilo, block)?.config : undefined;
    const longo = config !== undefined && !linearCabe(config, block.words.map((word) => word.text));
    return longo && !block.review ? {...block, review: true} : block;
  });

const blockSignature = (block: CaptionBlock): string =>
  `${block.startMs}:${block.words.map((word) => `${normalizeForKeyword(word.text)}@${word.startMs}`).join("|")}`;

// Refaz a divisão a partir das palavras, mantendo palavra-chave, layout e
// "revisar" dos blocos que não mudaram.
export const regroupAndPreserveManualFields = (
  words: Word[],
  savedBlocks: CaptionBlock[],
): CaptionBlock[] => {
  const savedBySignature = new Map(savedBlocks.map((block) => [blockSignature(block), block]));

  return groupWords(words).map((block) => {
    const saved = savedBySignature.get(blockSignature(block));
    if (!saved) {
      return block;
    }

    return {
      ...block,
      keyword: saved.keyword || block.keyword,
      template: saved.template,
      family: saved.family,
      pacote: saved.pacote,
      paleta: saved.paleta,
      dupla: saved.dupla,
      layoutManual: saved.layoutManual,
      som: saved.som,
      posicao: saved.posicao,
      review: block.review || saved.review ? true : undefined,
    };
  });
};

// Lista de palavras do projeto, sempre igual às palavras dos blocos.
export const wordsOfBlocks = (blocks: CaptionBlock[]): Word[] =>
  blocks.flatMap((block) => block.words.map((word) => ({...word})));

const withWords = <T extends CaptionBlock>(block: T, words: Word[]): T => ({
  ...block,
  words,
  startMs: words[0].startMs,
  endMs: words[words.length - 1].endMs,
});

export const setWordText = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  wordIndex: number,
  text: string,
): AssignedCaptionBlock[] =>
  blocks.map((block, index) => {
    if (index !== blockIndex) {
      return block;
    }
    const wasKeyword = findKeywordIndex(block.words, block.keyword) === wordIndex;
    const words = block.words.map((word, position) =>
      position === wordIndex ? {...word, text} : word,
    );
    return {...block, words, keyword: wasKeyword ? text : block.keyword};
  });

// Troca a palavra-chave. O layout é escolhido de novo pelas regras do pacote,
// mantendo a família, a não ser que tenha sido escolhido à mão.
export const setKeyword = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  wordIndex: number,
  estilo: Estilo,
): AssignedCaptionBlock[] =>
  blocks.map((block, index) => {
    if (index !== blockIndex) {
      return block;
    }
    const updated = {...block, keyword: block.words[wordIndex].text};
    // Na dupla e no layout escolhido à mão, só a palavra-chave muda.
    return block.layoutManual || block.dupla
      ? updated
      : {...updated, template: layoutForKeywordIn(updated, wordIndex, rulesForBlock(estilo, block))};
  });

// Pacote de um layout do estilo atual ("d/d6" no modo misto, "d6" com um pacote só).
const packageOfLayout = (estilo: Estilo, templateName: string): string | undefined =>
  Object.values(estilo.pacotes).find(
    (rules) => templateName.startsWith(rules.prefix) && rules.templates[templateName.slice(rules.prefix.length)],
  )?.name;

// Desfaz a dupla de que o bloco faz parte: os dois ficam soltos e o parceiro vira
// linear (o bloco em blockIndex será redefinido por quem chamou).
const dissolvePairAt = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  estilo: Estilo,
): AssignedCaptionBlock[] => {
  const block = blocks[blockIndex];
  if (!block?.dupla) {
    return blocks;
  }
  const partnerIndex = block.dupla === "primeiro" ? blockIndex + 1 : blockIndex - 1;
  return blocks.map((current, index) => {
    if (index === blockIndex) {
      return {...current, dupla: undefined};
    }
    if (index === partnerIndex && current.dupla) {
      const rules = rulesForBlock(estilo, current);
      return {
        ...current,
        dupla: undefined,
        layoutManual: undefined,
        family: "linear",
        template: rules.prefix + rules.config.linear,
      };
    }
    return current;
  });
};

// Layout escolhido à mão no menu: fica marcado para não ser trocado sozinho.
// Um layout de dupla liga o bloco ao seguinte (os dois na tela ao mesmo tempo).
export const setLayout = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  templateName: string,
  estilo: Estilo,
): AssignedCaptionBlock[] => {
  const template = estilo.templates[templateName];
  const pacote = packageOfLayout(estilo, templateName);
  let result = dissolvePairAt(blocks, blockIndex, estilo);
  const isPair = template.structure === "dupla" && result[blockIndex + 1] !== undefined;
  if (isPair) {
    result = dissolvePairAt(result, blockIndex + 1, estilo);
  }
  return result.map((block, index) => {
    if (index === blockIndex) {
      return {
        ...block,
        template: templateName,
        family: template.family,
        layoutManual: true,
        pacote: pacote ?? block.pacote,
        dupla: isPair ? "primeiro" : undefined,
      };
    }
    if (isPair && index === blockIndex + 1) {
      return {...block, template: templateName, family: template.family, layoutManual: true, pacote: pacote ?? block.pacote, dupla: "segundo"};
    }
    return block;
  });
};

export const toggleReview = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
): AssignedCaptionBlock[] =>
  blocks.map((block, index) =>
    index === blockIndex ? {...block, review: block.review ? undefined : true} : block,
  );

// Junta o bloco com o seguinte. O resultado mantém o layout e a palavra-chave do primeiro.
export const mergeWithNext = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  estilo: Estilo,
): AssignedCaptionBlock[] => {
  // Juntar desfaz as duplas dos dois blocos.
  blocks = dissolvePairAt(dissolvePairAt(blocks, blockIndex, estilo), blockIndex + 1, estilo);
  const first = blocks[blockIndex];
  const second = blocks[blockIndex + 1];
  if (!first || !second) {
    return blocks;
  }
  const merged = withWords(
    {...first, review: first.review || second.review ? true : undefined},
    [...first.words, ...second.words],
  );
  return [...blocks.slice(0, blockIndex), merged, ...blocks.slice(blockIndex + 2)];
};

// Divide o bloco antes da palavra wordIndex. A primeira parte mantém o layout;
// a segunda vira linear, com a palavra-chave escolhida automaticamente.
export const splitBefore = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  wordIndex: number,
  estilo: Estilo,
): AssignedCaptionBlock[] => {
  // Dividir desfaz a dupla do bloco.
  blocks = dissolvePairAt(blocks, blockIndex, estilo);
  const block = blocks[blockIndex];
  const rules = block ? rulesForBlock(estilo, block) : undefined;
  if (!block || wordIndex <= 0 || wordIndex >= block.words.length) {
    return blocks;
  }
  const firstWords = block.words.slice(0, wordIndex);
  const secondWords = block.words.slice(wordIndex);
  const keywordIndex = findKeywordIndex(block.words, block.keyword);
  const first = withWords(
    {
      ...block,
      keyword: keywordIndex < wordIndex ? block.keyword : chooseKeyword(firstWords),
    },
    firstWords,
  );
  const second = withWords(
    {
      ...block,
      keyword: keywordIndex >= wordIndex ? block.keyword : chooseKeyword(secondWords),
      template: rules!.prefix + rules!.config.linear,
      family: rules!.templates[rules!.config.linear]?.family ?? "linear",
      pacote: rules!.name,
      layoutManual: undefined,
      som: undefined,
    },
    secondWords,
  );
  return [...blocks.slice(0, blockIndex), first, second, ...blocks.slice(blockIndex + 1)];
};

// Marca como "revisar" os blocos que ficam menos que o tempo mínimo de tela.
// Não altera a divisão: usado com --usar-transcricao e na interface.
export const markShortBlocks = (blocks: AssignedCaptionBlock[]): AssignedCaptionBlock[] => {
  const short = new Set(shortBlockIndexes(blocks));
  return short.size === 0
    ? blocks
    : blocks.map((block, index) => (short.has(index) && !block.review ? {...block, review: true} : block));
};

// Paleta só de um bloco (undefined volta para a paleta geral do vídeo).
export const setBlockPalette = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  paleta: string | undefined,
): AssignedCaptionBlock[] =>
  blocks.map((block, index) => (index === blockIndex ? {...block, paleta} : block));

// Exclui o bloco inteiro: ele sai da lista (e do vídeo) e é devolvido para ficar
// guardado em "excluidos". Se fazia parte de uma dupla, a dupla é desfeita.
export const excludeBlock = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  estilo: Estilo,
): {blocks: AssignedCaptionBlock[]; excluido?: AssignedCaptionBlock} => {
  const semDupla = dissolvePairAt(blocks, blockIndex, estilo);
  const excluido = semDupla[blockIndex];
  return excluido
    ? {blocks: semDupla.filter((_, index) => index !== blockIndex), excluido: {...excluido, dupla: undefined}}
    : {blocks};
};

// Exclui uma palavra. Os tempos das outras não mudam; se era a palavra-chave,
// outra palavra do bloco assume; se era a última palavra, o bloco é excluído.
export const removeWord = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  wordIndex: number,
  estilo: Estilo,
): {blocks: AssignedCaptionBlock[]; excluido?: AssignedCaptionBlock} => {
  const block = blocks[blockIndex];
  if (!block?.words[wordIndex]) {
    return {blocks};
  }
  if (block.words.length === 1) {
    return excludeBlock(blocks, blockIndex, estilo);
  }
  const wasKeyword = findKeywordIndex(block.words, block.keyword) === wordIndex;
  const words = block.words.filter((_, index) => index !== wordIndex);
  const updated = withWords({...block, keyword: wasKeyword ? chooseKeyword(words) : block.keyword}, words);
  return {blocks: blocks.map((current, index) => (index === blockIndex ? updated : current))};
};

// Devolve um bloco excluído para a lista, na ordem da fala. Se o layout dele não
// existe mais no estilo atual (o pacote mudou), ele volta como linear.
export const restoreBlock = (
  blocks: AssignedCaptionBlock[],
  excluido: CaptionBlock,
  estilo: Estilo,
): AssignedCaptionBlock[] => {
  const rules = rulesForBlock(estilo, excluido);
  const restored: AssignedCaptionBlock = estilo.templates[excluido.template] && excluido.family
    ? {...(excluido as AssignedCaptionBlock), dupla: undefined}
    : {
        ...excluido,
        dupla: undefined,
        layoutManual: undefined,
        family: "linear",
        template: rules.prefix + rules.config.linear,
        pacote: rules.name,
      };
  const position = blocks.findIndex((block) => block.startMs > restored.startMs);
  return position < 0 ? [...blocks, restored] : [...blocks.slice(0, position), restored, ...blocks.slice(position)];
};

// Posição só de um bloco (undefined volta para a geral). Na dupla, os dois blocos
// recebem a mesma posição (o conjunto se move junto).
export const setBlockPosition = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  posicao: {x: number; y: number} | undefined,
): AssignedCaptionBlock[] => {
  const block = blocks[blockIndex];
  const partner = block?.dupla === "primeiro" ? blockIndex + 1 : block?.dupla === "segundo" ? blockIndex - 1 : -1;
  return blocks.map((current, index) => (index === blockIndex || index === partner ? {...current, posicao} : current));
};

// Todos os blocos voltam para a posição geral.
export const clearBlockPositions = (blocks: AssignedCaptionBlock[]): AssignedCaptionBlock[] =>
  blocks.map((block) => (block.posicao ? {...block, posicao: undefined} : block));

// Passa um vídeo de um pacote só para o modo misto sem mudar nenhum layout: cada
// layout ganha o prefixo do pacote ("e4" vira "e/e4"), como no modo misto.
export const blocksToMixed = (blocks: AssignedCaptionBlock[], pacote: string): AssignedCaptionBlock[] =>
  blocks.map((block) =>
    block.template.includes("/") ? block : {...block, template: `${pacote}/${block.template}`, pacote: block.pacote ?? pacote},
  );

// Efeito sonoro de um bloco: undefined (automático), SEM_SOM ou um arquivo de sons/.
export const setBlockSound = (
  blocks: AssignedCaptionBlock[],
  blockIndex: number,
  som: string | undefined,
): AssignedCaptionBlock[] =>
  blocks.map((block, index) => (index === blockIndex ? {...block, som} : block));

// Todos os blocos voltam para a paleta geral do vídeo.
export const clearBlockPalettes = (blocks: AssignedCaptionBlock[]): AssignedCaptionBlock[] =>
  blocks.map((block) => (block.paleta ? {...block, paleta: undefined} : block));
