import type {Caption} from "@remotion/captions";
import {AGRUPAMENTO_CONFIG} from "./agrupamento-config";
import type {CaptionBlock, Word} from "./types";

const HESITATION_PAIR = new Set(["um uma", "uma um"]);
const BLOCK_END_FUNCTION_WORDS = new Set(
  [
    "a", "ao", "aos", "as", "com", "da", "das", "de", "do", "dos", "em", "entre",
    "e", "mas", "nem", "ou", "para", "pela", "pelas", "pelo", "pelos", "por", "que",
    "se", "sem", "um", "uma", "uns", "umas", "o", "os", "na", "nas", "no", "nos",
    "num", "numa", "pra", "pro", "pras", "pros", "ate", "porque", "pois", "como",
    // Possessivos e demonstrativos também pedem a palavra seguinte.
    "meu", "minha", "meus", "minhas", "teu", "tua", "teus", "tuas", "seu", "sua",
    "seus", "suas", "nosso", "nossa", "nossos", "nossas", "esse", "essa", "esses",
    "essas", "este", "esta", "estes", "estas", "aquele", "aquela", "aqueles", "aquelas",
  ],
);

const commonPortugueseWords = new Set(
  [
    "a", "ao", "aos", "as", "ate", "com", "como", "da", "das", "de", "do", "dos",
    "e", "em", "entre", "era", "essa", "esse", "esta", "este", "eu", "foi", "ja",
    "mais", "mas", "me", "meu", "minha", "na", "nas", "nem", "no", "nos", "o", "os",
    "ou", "para", "pela", "pelas", "pelo", "pelos", "por", "qual", "quando", "que",
    "quem", "se", "sem", "ser", "seu", "sua", "tambem", "te", "tem", "um", "uma",
    "voce", " voces ",
  ].map((word) => word.trim()),
);

export const normalizeForKeyword = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]/gu, "");

export const isCommonPortugueseWord = (text: string): boolean =>
  commonPortugueseWords.has(normalizeForKeyword(text));

// Uma palavra seguida de pontuação fecha uma frase, então não é artigo nem
// preposição (ex.: "pelos," de cabelo, e não a preposição "pelos").
export const isBlockEndingFunctionWord = (text: string): boolean =>
  !/[,;:.!?…]["')\]]*$/u.test(text) && BLOCK_END_FUNCTION_WORDS.has(normalizeForKeyword(text));

export const chooseKeyword = (words: Word[]): string =>
  words[keywordCandidates(words.map((word) => word.text))[0]]?.text ?? "";

// Posição da palavra-chave no bloco; se ela não for encontrada, usa a escolha automática.
export const findKeywordIndex = (words: Word[], keyword: string): number => {
  const target = normalizeForKeyword(keyword);
  const index = words.findIndex((word) => normalizeForKeyword(word.text) === target);
  if (index >= 0) {
    return index;
  }
  const fallback = normalizeForKeyword(chooseKeyword(words));
  return Math.max(0, words.findIndex((word) => normalizeForKeyword(word.text) === fallback));
};

type GroupingWord = Word & {_review?: true};

const displayText = (text: string): string => text.replace(/[,.:;]+(?=[!?]*$)/gu, "");

const prepareGroupingWords = (words: Word[]): GroupingWord[] => {
  const prepared: GroupingWord[] = [];

  for (const word of words) {
    const previous = prepared[prepared.length - 1];
    if (!previous) {
      prepared.push(word);
      continue;
    }

    const previousNormalized = normalizeForKeyword(previous.text);
    const currentNormalized = normalizeForKeyword(word.text);
    const isRepeated = previousNormalized.length > 0 && previousNormalized === currentNormalized;
    const isHesitation = HESITATION_PAIR.has(`${previousNormalized} ${currentNormalized}`);

    if (isRepeated || isHesitation) {
      prepared[prepared.length - 1] = {
        ...word,
        startMs: previous.startMs,
        _review: true,
      };
      continue;
    }

    prepared.push(word);
  }

  return prepared;
};

export const captionsToWords = (captions: Caption[]): Word[] => {
  const words: Word[] = [];

  for (const caption of captions) {
    const startsWithSpace = /^\s/u.test(caption.text);
    const pieces = caption.text.trim().split(/\s+/u).filter(Boolean);
    if (pieces.length === 0) {
      continue;
    }

    const totalCharacters = pieces.reduce((total, piece) => total + piece.length, 0);
    const duration = Math.max(0, caption.endMs - caption.startMs);
    let consumedCharacters = 0;

    pieces.forEach((piece, index) => {
      const startMs = caption.startMs + (duration * consumedCharacters) / totalCharacters;
      consumedCharacters += piece.length;
      const endMs = caption.startMs + (duration * consumedCharacters) / totalCharacters;
      const beginsWord = words.length === 0 || index > 0 || startsWithSpace;

      if (beginsWord) {
        words.push({text: piece, startMs: Math.round(startMs), endMs: Math.round(endMs)});
        return;
      }

      const previousWord = words[words.length - 1];
      previousWord.text += piece;
      previousWord.endMs = Math.round(endMs);
    });
  }

  return words;
};

const blockCharacters = (chunk: GroupingWord[]): number =>
  chunk.reduce((count, word) => count + displayText(word.text).length, chunk.length - 1);

type ProtectedSpans = {
  // protectedCut[i] = cortar antes da palavra i quebraria uma expressão protegida.
  protectedCut: boolean[];
  // Trechos [início, fim) onde aparece uma expressão protegida inteira.
  spans: [number, number][];
};

export const findProtectedSpans = (texts: string[]): ProtectedSpans => {
  const protectedCut = Array<boolean>(texts.length + 1).fill(false);
  const spans: [number, number][] = [];
  const normalizedWords = texts.map(normalizeForKeyword);

  for (const expression of AGRUPAMENTO_CONFIG.expressoesProtegidas) {
    const parts = expression.split(/\s+/u).map(normalizeForKeyword).filter(Boolean);
    if (parts.length < 2) {
      continue;
    }

    for (let start = 0; start + parts.length <= texts.length; start++) {
      if (parts.every((part, offset) => normalizedWords[start + offset] === part)) {
        spans.push([start, start + parts.length]);
        for (let cut = start + 1; cut < start + parts.length; cut++) {
          protectedCut[cut] = true;
        }
      }
    }
  }

  return {protectedCut, spans};
};

type NaturalCut = "nenhum" | "virgula-ou-pausa" | "fim-de-frase";

// naturalCut[i] = tipo de pontuação ou pausa entre a palavra i - 1 e a palavra i.
const findNaturalCuts = (words: GroupingWord[]): NaturalCut[] => {
  const naturalCut = Array<NaturalCut>(words.length + 1).fill("nenhum");
  for (let index = 1; index < words.length; index++) {
    const previous = words[index - 1];
    const pauseMs = words[index].startMs - previous.endMs;
    if (endsSentence(previous.text)) {
      naturalCut[index] = "fim-de-frase";
    } else if (pauseMs > AGRUPAMENTO_CONFIG.pausaMinimaMs || /[,;:]$/u.test(previous.text)) {
      naturalCut[index] = "virgula-ou-pausa";
    }
  }
  return naturalCut;
};

// ---- Linha de apoio de cima nos destaques ----

export const isStrongWord = (text: string): boolean => !isCommonPortugueseWord(text);

export const endsSentence = (text: string): boolean => /[.!?…]["')\]]*$/u.test(text);

// A linha de cima vale se estiver vazia ou tiver palavras ou caracteres suficientes.
export const isValidTopLine = (texts: string[]): boolean => {
  const {minPalavras, minCaracteres} = AGRUPAMENTO_CONFIG.linhaDeCima;
  return (
    texts.length === 0 ||
    texts.length >= minPalavras ||
    texts.map(displayText).join(" ").length >= minCaracteres
  );
};

// Palavras que ficam na linha de cima quando a palavra-chave está em keywordIndex.
// Com 3+ palavras antes e nenhuma depois (escada), a última antes da chave desce
// para a linha do meio; nos outros casos, tudo o que vem antes fica em cima.
export const topLineFor = (texts: string[], keywordIndex: number): string[] => {
  const isStaircase = keywordIndex >= 3 && keywordIndex === texts.length - 1;
  return texts.slice(0, isStaircase ? keywordIndex - 1 : keywordIndex);
};

// Palavras candidatas a palavra-chave, da mais forte para a mais fraca.
export const keywordCandidates = (texts: string[]): number[] => {
  const strong = texts.map((_, index) => index).filter((index) => isStrongWord(texts[index]));
  return (strong.length > 0 ? strong : texts.map((_, index) => index)).sort(
    (left, right) =>
      normalizeForKeyword(texts[right]).length - normalizeForKeyword(texts[left]).length ||
      left - right,
  );
};

// O bloco consegue virar destaque sem uma linha de cima inválida?
export const highlightTopCanBeValid = (texts: string[]): boolean => {
  if (texts.length <= 1) {
    return true;
  }
  const {spans} = findProtectedSpans(texts);
  if (spans.length > 0) {
    return isValidTopLine(texts.slice(0, spans[0][0]));
  }
  return keywordCandidates(texts).some((index) => isValidTopLine(topLineFor(texts, index)));
};

export type BlockPenalty = {
  reason: string;
  points: number;
};

const TIE_BREAK_REASON = "desempate";
const TOP_LINE_REASON = "como destaque, teria linha de cima inválida";

const blockPenalties = (
  words: GroupingWord[],
  start: number,
  end: number,
  protectedCut: boolean[],
  naturalCut: NaturalCut[],
): BlockPenalty[] => {
  const {penalidades, desempate, maxCaracteresPorBloco} = AGRUPAMENTO_CONFIG;
  const chunk = words.slice(start, end);
  const penalties: BlockPenalty[] = [];

  if (end < words.length && protectedCut[end]) {
    penalties.push({
      reason: "quebra uma expressão protegida",
      points: penalidades.quebrarExpressaoProtegida,
    });
  }
  if (isBlockEndingFunctionWord(chunk[chunk.length - 1].text)) {
    penalties.push({
      reason: "termina em palavra de ligação",
      points: penalidades.terminarEmPalavraDeLigacao,
    });
  }
  if (chunk.every((word) => isCommonPortugueseWord(word.text))) {
    penalties.push({reason: "só tem palavras comuns", points: penalidades.soPalavrasComuns});
  }
  if (chunk.length === 1) {
    penalties.push({reason: "tem uma palavra só", points: penalidades.blocoDeUmaPalavra});
  }
  if (!highlightTopCanBeValid(chunk.map((word) => word.text))) {
    penalties.push({
      reason: TOP_LINE_REASON,
      points: penalidades.linhaDeCimaInvalida,
    });
  }
  const characters = blockCharacters(chunk);
  if (characters > maxCaracteresPorBloco) {
    penalties.push({
      reason: `passa de ${maxCaracteresPorBloco} caracteres (${characters})`,
      points: penalidades.passarDoLimiteDeCaracteres,
    });
  }
  const insideCuts = naturalCut.slice(start + 1, end);
  const crossedSentenceEnds = insideCuts.filter((cut) => cut === "fim-de-frase").length;
  if (crossedSentenceEnds > 0) {
    penalties.push({
      reason: "atravessa um fim de frase",
      points: crossedSentenceEnds * penalidades.atravessarFimDeFrase,
    });
  }
  const crossedCommas = insideCuts.filter((cut) => cut === "virgula-ou-pausa").length;
  if (crossedCommas > 0) {
    penalties.push({
      reason: "atravessa uma vírgula ou pausa",
      points: crossedCommas * penalidades.atravessarVirgulaOuPausa,
    });
  }

  const tieBreak =
    (end < words.length && naturalCut[end] === "nenhum" ? desempate.cortarForaDePausa : 0) +
    Math.abs(desempate.tamanhoIdeal - chunk.length) * desempate.distanciaDoTamanhoIdeal;
  if (tieBreak > 0) {
    penalties.push({reason: TIE_BREAK_REASON, points: tieBreak});
  }

  return penalties;
};

const sumPoints = (penalties: BlockPenalty[]): number =>
  penalties.reduce((total, penalty) => total + penalty.points, 0);

type PartitionedChunk = {
  chunk: GroupingWord[];
  penalties: BlockPenalty[];
};

// Escolhe a divisão de menor penalidade total. Sempre encontra uma resposta,
// porque qualquer sequência de blocos de 1 a N palavras é aceita.
const partitionWords = (words: GroupingWord[]): PartitionedChunk[] => {
  const wordCount = words.length;
  if (wordCount === 0) {
    return [];
  }

  const maxWords = Math.max(1, Math.floor(AGRUPAMENTO_CONFIG.maxPalavrasPorBloco));
  const maxWordsWithExpression = Math.max(
    maxWords,
    Math.floor(AGRUPAMENTO_CONFIG.maxPalavrasComExpressaoProtegida),
  );
  const {protectedCut, spans} = findProtectedSpans(words.map((word) => word.text));
  const naturalCut = findNaturalCuts(words);
  const bestCost = Array<number>(wordCount + 1).fill(Number.POSITIVE_INFINITY);
  const nextIndex = Array<number>(wordCount + 1).fill(-1);
  bestCost[wordCount] = 0;

  for (let start = wordCount - 1; start >= 0; start--) {
    for (let end = start + 1; end <= Math.min(wordCount, start + maxWordsWithExpression); end++) {
      const containsExpression = spans.some(
        ([spanStart, spanEnd]) => spanStart >= start && spanEnd <= end,
      );
      if (end - start > maxWords && !containsExpression) {
        continue;
      }
      const cost =
        bestCost[end] + sumPoints(blockPenalties(words, start, end, protectedCut, naturalCut));
      if (cost < bestCost[start]) {
        bestCost[start] = cost;
        nextIndex[start] = end;
      }
    }
  }

  const chunks: PartitionedChunk[] = [];
  for (let start = 0; start < wordCount; start = nextIndex[start]) {
    const end = nextIndex[start];
    chunks.push({
      chunk: words.slice(start, end),
      penalties: blockPenalties(words, start, end, protectedCut, naturalCut).filter(
        (penalty) => penalty.reason !== TIE_BREAK_REASON,
      ),
    });
  }

  return chunks;
};

// Divide um bloco linear em dois no ponto de menor penalidade do agrupador. Prefere
// os cortes em que as duas partes ficam com até maxWords palavras. A penalidade de
// linha de cima de destaque não conta: um linear não tem linha de cima.
export const splitInTwo = (words: Word[], maxWords: number): [Word[], Word[]] => {
  const {protectedCut} = findProtectedSpans(words.map((word) => word.text));
  const naturalCut = findNaturalCuts(words);
  const linearPoints = (start: number, end: number): number =>
    sumPoints(
      blockPenalties(words, start, end, protectedCut, naturalCut).filter(
        (penalty) => penalty.reason !== TOP_LINE_REASON,
      ),
    );
  let best: {cut: number; cost: number} | undefined;
  for (let cut = 1; cut < words.length; cut++) {
    const fits = cut <= maxWords && words.length - cut <= maxWords;
    const cost = (fits ? 0 : 1_000_000) + linearPoints(0, cut) + linearPoints(cut, words.length);
    if (!best || cost < best.cost) {
      best = {cut, cost};
    }
  }
  const cut = best?.cut ?? Math.ceil(words.length / 2);
  return [words.slice(0, cut), words.slice(cut)];
};

export const explainGrouping = (words: Word[]): {text: string; penalties: BlockPenalty[]}[] =>
  partitionWords(prepareGroupingWords(words)).map(({chunk, penalties}) => ({
    text: chunk.map((word) => word.text).join(" "),
    penalties,
  }));

// Tempo de tela estimado na divisão: do início do bloco até o início do seguinte,
// no máximo permanenciaMaximaMs depois da última palavra. (O atraso dos destaques
// ainda não existe aqui; ele só aparece depois da escolha de layouts.)
const estimatedScreenMs = (chunks: GroupingWord[][], index: number): number => {
  const chunk = chunks[index];
  const nextStartMs = chunks[index + 1]?.[0].startMs ?? Number.POSITIVE_INFINITY;
  const lastWordEndMs = chunk[chunk.length - 1].endMs;
  return (
    Math.min(nextStartMs, lastWordEndMs + AGRUPAMENTO_CONFIG.tempos.permanenciaMaximaMs) -
    chunk[0].startMs
  );
};

// Dois blocos vizinhos podem virar um só: até maxPalavrasPorBloco palavras e sem
// pontuação nem pausa entre eles (uma junção nunca corta expressão protegida).
const canJoin = (left: GroupingWord[], right: GroupingWord[]): boolean => {
  const last = left[left.length - 1];
  return (
    left.length + right.length <= AGRUPAMENTO_CONFIG.maxPalavrasPorBloco &&
    !/[,;:.!?…]["')\]]*$/u.test(last.text) &&
    right[0].startMs - last.endMs <= AGRUPAMENTO_CONFIG.pausaMinimaMs
  );
};

// Junta blocos que ficariam menos que tempoMinimoDeTelaMs na tela: primeiro com o
// seguinte, depois com o anterior. Os que sobrarem ganham o atraso do bloco
// seguinte na linha do tempo de exibição (tempos.ts).
const joinShortChunks = (chunks: GroupingWord[][]): GroupingWord[][] => {
  const result = chunks.map((chunk) => [...chunk]);
  for (let index = 0; index < result.length; ) {
    if (estimatedScreenMs(result, index) >= AGRUPAMENTO_CONFIG.tempos.tempoMinimoDeTelaMs) {
      index++;
    } else if (index + 1 < result.length && canJoin(result[index], result[index + 1])) {
      result.splice(index, 2, [...result[index], ...result[index + 1]]);
    } else if (index > 0 && canJoin(result[index - 1], result[index])) {
      result.splice(index - 1, 2, [...result[index - 1], ...result[index]]);
      index--;
    } else {
      index++;
    }
  }
  return result;
};

export const groupWords = (words: Word[]): CaptionBlock[] =>
  joinShortChunks(partitionWords(prepareGroupingWords(words)).map(({chunk}) => chunk)).map((chunk) => {
    const review = chunk.some((word) => word._review);
    const cleanWords = chunk.map(({_review: _discarded, ...word}) => word);
    return {
      words: cleanWords,
      startMs: cleanWords[0].startMs,
      endMs: cleanWords[cleanWords.length - 1].endMs,
      keyword: chooseKeyword(cleanWords),
      template: "",
      ...(review ? {review: true} : {}),
    };
  });