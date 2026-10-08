import {
  chooseKeyword,
  dividirLinear,
  endsSentence,
  findKeywordIndex,
  findProtectedSpans,
  isCommonPortugueseWord,
  isStrongWord,
  isValidTopLine,
  keywordCandidates,
  normalizeForKeyword,
} from "./captions";
import {AGRUPAMENTO_CONFIG} from "./agrupamento-config";
import {temEloDepois} from "./papeis";
import {RHYTHM_CONFIG} from "./rhythm-config";
import {keywordStaysVisible} from "./tempos";
import type {
  AssignedCaptionBlock,
  CaptionBlock,
  CaptionStructure,
  CaptionTemplate,
  CountRange,
  LayoutRule,
  PackageConfig,
  PalavrasDoLinear,
  TemplateFamily,
  Word,
} from "./types";

type RhythmOptions = {
  preserveAssignments: boolean;
  templateChoice?: string;
};

type HighlightChoice = {
  template: string;
  keywordIndex: number;
};

const blockStrength = (block: CaptionBlock): number => {
  const keyword = normalizeForKeyword(block.keyword);
  if (!keyword) {
    return 0;
  }

  return keyword.length + (isCommonPortugueseWord(block.keyword) ? 0 : 1000);
};

const textsOf = (block: CaptionBlock): string[] => block.words.map((word) => word.text);

// A palavra em keywordIndex, como palavra-chave, fica visível tempo suficiente
// antes do próximo bloco (já contando o atraso permitido dele)?
const keywordVisibleEnough = (
  block: CaptionBlock,
  keywordIndex: number,
  nextStartMs: number,
): boolean =>
  keywordStaysVisible(
    block.words[keywordIndex].startMs,
    block.words[block.words.length - 1].endMs,
    nextStartMs,
  );

// Blocos de uma palavra só ou com expressão protegida sempre viram destaque
// (se o vizinho permitir).
const mustHighlight = (block: CaptionBlock): boolean =>
  block.words.length === 1 || findProtectedSpans(textsOf(block)).spans.length > 0;

// Palavras que ficam na linha de cima, conforme a estrutura do layout.
const topLineOf = (
  structure: CaptionStructure,
  texts: string[],
  keywordIndex: number,
): string[] => {
  if (structure === "linear") {
    return [];
  }
  if (structure === "escada" || structure === "pilha") {
    // A última palavra antes da chave desce para a linha do meio.
    return texts.slice(0, Math.max(0, keywordIndex - 1));
  }
  return texts.slice(0, keywordIndex);
};

const inRange = (value: number, range: CountRange | undefined): boolean =>
  range === undefined ||
  (value >= (range.min ?? Number.NEGATIVE_INFINITY) && value <= (range.max ?? Number.POSITIVE_INFINITY));

// O linear cabe nos limites do pacote (palavras e caracteres)?
export const linearCabe = (config: PalavrasDoLinear, texts: string[]): boolean =>
  (config.maxLinearWords === undefined || texts.length <= config.maxLinearWords) &&
  (config.maxLinearCaracteres === undefined || texts.length === 1 || texts.join(" ").length <= config.maxLinearCaracteres);

// A regra vale para as palavras com a palavra-chave em keywordIndex?
const regraVale = (rule: LayoutRule, texts: string[], keywordIndex: number, hasExpression: boolean): boolean =>
  (rule.protectedExpression === undefined || rule.protectedExpression === hasExpression) &&
  (rule.eloDepois === undefined || rule.eloDepois === temEloDepois(texts, keywordIndex)) &&
  inRange(texts.length, rule.words) &&
  inRange(keywordIndex, rule.before) &&
  inRange(texts.length - keywordIndex - 1, rule.after);

// Primeira regra de destaque do pacote que vale para a palavra-chave em keywordIndex.
const matchingRule = (
  config: PackageConfig,
  texts: string[],
  keywordIndex: number,
  hasExpression: boolean,
): LayoutRule | undefined => config.highlight.find((rule) => regraVale(rule, texts, keywordIndex, hasExpression));

// O layout serve para o bloco pelas regras do pacote? (galeria: os que não servem
// ficam esmaecidos). Linear: até maxLinearWords palavras. Dupla: precisa de um
// bloco seguinte. Destaque: alguma regra com o layout aceita as palavras antes e
// depois da palavra-chave, ou ele é de três linhas com a palavra-chave primeiro.
export const layoutServeParaBloco = (
  layout: string,
  templates: Record<string, CaptionTemplate>,
  config: PackageConfig,
  block: CaptionBlock,
  temBlocoSeguinte: boolean,
): boolean => {
  const template = templates[layout];
  if (!template) {
    return false;
  }
  const texts = textsOf(block);
  if (template.family === "linear") {
    return linearCabe(config, texts);
  }
  if (template.structure === "dupla") {
    return temBlocoSeguinte;
  }
  const keywordIndex = findKeywordIndex(block.words, block.keyword);
  const hasExpression = findProtectedSpans(texts).spans.length > 0;
  return (
    (config.threeLines.includes(layout) && keywordIndex === 0) ||
    config.highlight.some((rule) => rule.templates.includes(layout) && regraVale(rule, texts, keywordIndex, hasExpression))
  );
};

// Layout de um bloco pelas regras do pacote quando a palavra-chave é trocada à mão.
// Mantém a família: um linear continua com o layout que tem; um destaque recebe o
// layout da regra que vale (o atual, se ele estiver entre os da regra).
export const layoutForKeyword = (
  block: AssignedCaptionBlock,
  keywordIndex: number,
  config: PackageConfig,
): string => {
  if (block.family !== "destaque") {
    return block.template;
  }
  const texts = textsOf(block);
  const hasExpression = findProtectedSpans(texts).spans.length > 0;
  const rule =
    (hasExpression
      ? config.highlight.find(
          (candidate) => candidate.protectedExpression === true && inRange(texts.length, candidate.words),
        )
      : undefined) ?? matchingRule(config, texts, keywordIndex, hasExpression);
  if (!rule) {
    return block.template;
  }
  return rule.templates.includes(block.template) ? block.template : rule.templates[0];
};

// Escolhe layouts do pacote, alternando entre os templates de cada regra.
const createLayoutPicker = (
  config: PackageConfig,
  templates: Record<string, CaptionTemplate>,
) => {
  const cursors = new Map<string[], number>();
  const peek = (names: string[]): string => names[(cursors.get(names) ?? 0) % names.length];
  const commit = (names: string[]): void => {
    cursors.set(names, (cursors.get(names) ?? 0) + 1);
  };

  // Arranjo de destaque dentro do próprio bloco, sem linha de cima inválida.
  // Primeiro a palavra-chave atual; depois (regra a) outra palavra forte que deixe
  // uma linha de cima válida e não vazia.
  const arrangeWithinBlock = (
    block: CaptionBlock,
    nextStartMs: number,
  ): HighlightChoice | undefined => {
    const texts = textsOf(block);
    const {spans} = findProtectedSpans(texts);
    const hasExpression = spans.length > 0;

    if (hasExpression) {
      const spanStart = spans[0][0];
      const rule = config.highlight.find(
        (candidate) => candidate.protectedExpression === true && inRange(texts.length, candidate.words),
      );
      if (rule) {
        const name = peek(rule.templates);
        if (
          !isValidTopLine(topLineOf(templates[name].structure, texts, spanStart)) ||
          !keywordVisibleEnough(block, spanStart, nextStartMs)
        ) {
          return undefined;
        }
        commit(rule.templates);
        return {template: name, keywordIndex: spanStart};
      }
    }

    const current = findKeywordIndex(block.words, block.keyword);
    const candidates = [current, ...keywordCandidates(texts).filter((index) => index !== current)];
    for (const keywordIndex of candidates) {
      const rule = matchingRule(config, texts, keywordIndex, hasExpression);
      if (!rule) {
        continue;
      }
      const name = peek(rule.templates);
      const top = topLineOf(templates[name].structure, texts, keywordIndex);
      // Na estrutura "papeis", a etiqueta pode ter uma palavra só: não há linha de cima a validar.
      const acceptable =
        templates[name].structure === "papeis"
          ? true
          : keywordIndex === current
            ? isValidTopLine(top)
            : top.length > 0 && isValidTopLine(top);
      if (acceptable && keywordVisibleEnough(block, keywordIndex, nextStartMs)) {
        commit(rule.templates);
        return {template: name, keywordIndex};
      }
    }
    return undefined;
  };

  const threeLines = (keywordIndex: number): HighlightChoice => {
    const name = peek(config.threeLines);
    commit(config.threeLines);
    return {template: name, keywordIndex};
  };

  return {arrangeWithinBlock, threeLines};
};

// Regra b: palavra-chave da composição de três linhas, com apoio válido em cima
// e tempo suficiente na tela.
const threeLinesKeyword = (block: CaptionBlock, nextStartMs: number): number | undefined => {
  const texts = textsOf(block);
  return keywordCandidates(texts).find((index) => {
    const top = texts.slice(0, index);
    return top.length > 0 && isValidTopLine(top) && keywordVisibleEnough(block, index, nextStartMs);
  });
};

const mergeBlocks = (first: CaptionBlock, second: CaptionBlock): CaptionBlock => ({
  ...first,
  words: [...first.words, ...second.words],
  endMs: second.endMs,
  ...(first.review || second.review ? {review: true} : {}),
});

// Define a família de cada bloco. Blocos que precisam de destaque viram destaque
// primeiro; depois cada ciclo do padrão de ritmo ganha no máximo um destaque.
// Dois destaques nunca ficam seguidos: quem sobra fica linear.
const assignFamilies = (blocks: CaptionBlock[]): TemplateFamily[] => {
  const families = Array<TemplateFamily>(blocks.length).fill("linear");
  const isHighlight = (index: number): boolean => families[index] === "destaque";
  const canHighlight = (index: number): boolean =>
    !isHighlight(index - 1) && !isHighlight(index + 1);

  const cycleSize = RHYTHM_CONFIG.pattern.length;
  if (cycleSize === 0) {
    throw new Error("O padrão de ritmo precisa conter ao menos uma família.");
  }
  const highlightsPerCycle = RHYTHM_CONFIG.pattern.filter((family) => family === "destaque").length;
  if (highlightsPerCycle > 1) {
    throw new Error("O padrão de ritmo pode ter no máximo um destaque por ciclo.");
  }

  blocks.forEach((block, index) => {
    if (mustHighlight(block) && canHighlight(index)) {
      families[index] = "destaque";
    }
  });

  for (let start = 0; start < blocks.length; start += cycleSize) {
    const indexes = Array.from(
      {length: Math.min(cycleSize, blocks.length - start)},
      (_, offset) => start + offset,
    );
    if (highlightsPerCycle === 0 || indexes.some(isHighlight)) {
      continue;
    }

    const [chosen] = indexes
      .filter(canHighlight)
      .sort((left, right) => blockStrength(blocks[right]) - blockStrength(blocks[left]));
    if (chosen !== undefined) {
      families[chosen] = "destaque";
    }
  }

  return families;
};

// Ritmo próprio de um pacote: dinâmicos nas frases mais fortes, lineares entre eles.
// Nunca dois dinâmicos seguidos e no máximo `maxLinearesSeguidos` lineares seguidos,
// contando cada pedaço de um linear longo (o que passa do máximo de palavras ou de
// caracteres vira mais de um linear). Com primeiroDestaque, o primeiro bloco do
// vídeo é dinâmico. Em cada trecho, entre os blocos que podem ser o próximo dinâmico
// sem quebrar as regras, vence o mais forte. Se um linear longo sozinho passa do
// máximo, ele é dividido aqui e o pedaço mais forte (que respeite as regras) vira
// dinâmico. Blocos com família escolhida à mão não mudam, e um dinâmico escolhido à
// mão conta como o dinâmico do trecho.
const familiasDoRitmo = (
  blocks: CaptionBlock[],
  ritmo: NonNullable<PackageConfig["ritmo"]>,
  limites: PalavrasDoLinear,
): {blocks: CaptionBlock[]; families: TemplateFamily[]} => {
  const maximo = Math.max(1, Math.floor(ritmo.maxLinearesSeguidos));
  const fila = [...blocks];
  const fixa = (block: CaptionBlock | undefined): TemplateFamily | undefined =>
    block?.layoutManual && block.family ? block.family : undefined;
  const dividir = (block: CaptionBlock): Word[][] =>
    dividirLinear(block.words, limites.maxLinearWords ?? Number.POSITIVE_INFINITY, limites.maxLinearCaracteres ?? Number.POSITIVE_INFINITY);
  // Quantos lineares o bloco vira (um escolhido à mão nunca é dividido).
  const pedacos = (block: CaptionBlock): number =>
    fixa(block) || linearCabe(limites, textsOf(block)) ? 1 : dividir(block).length;
  const forca = (block: CaptionBlock): number => blockStrength(block) + (mustHighlight(block) ? 10000 : 0);

  const saida: CaptionBlock[] = [];
  const families: TemplateFamily[] = [];
  let seguidos = 0;
  let anteriorDinamico = false;
  let inicio = 0;
  while (inicio < fila.length) {
    // Trecho alcançável: do próximo bloco até onde os lineares antes dele ainda cabem.
    const candidatos: number[] = [];
    let manual: number | undefined;
    let lineares = seguidos;
    let estourou: number | undefined;
    for (let j = inicio; j < fila.length; j++) {
      if (fixa(fila[j]) === "destaque") {
        manual = j;
        break;
      }
      const vizinhoDinamico = (j === inicio && anteriorDinamico) || fixa(fila[j + 1]) === "destaque";
      const primeiroDoVideo = ritmo.primeiroDestaque && saida.length === 0 && j === 0;
      if (!fixa(fila[j]) && !vizinhoDinamico) {
        candidatos.push(j);
      }
      if (primeiroDoVideo && candidatos[0] === 0) {
        break;
      }
      lineares += pedacos(fila[j]);
      if (lineares > maximo) {
        estourou = j;
        break;
      }
    }
    const escolhido =
      manual ??
      (ritmo.primeiroDestaque && saida.length === 0 && candidatos[0] === 0
        ? 0
        : [...candidatos].sort((a, b) => forca(fila[b]) - forca(fila[a]) || a - b)[0]);

    if (escolhido === undefined && estourou !== undefined && !fixa(fila[estourou]) && pedacos(fila[estourou]) > 1) {
      // O linear longo passou do máximo: vira os seus pedaços, e o trecho é refeito.
      const longo = fila[estourou];
      const partes = dividir(longo).map(
        (words): CaptionBlock => ({
          ...longo,
          words,
          startMs: words[0].startMs,
          endMs: words[words.length - 1].endMs,
          keyword: chooseKeyword(words),
        }),
      );
      fila.splice(estourou, 1, ...partes);
      continue;
    }

    // Sem dinâmico possível (lineares escolhidos à mão): o trecho todo fica linear.
    const ate = escolhido ?? (estourou ?? fila.length - 1);
    for (let j = inicio; j <= ate; j++) {
      const dinamico = j === escolhido;
      saida.push(fila[j]);
      families.push(dinamico ? "destaque" : (fixa(fila[j]) ?? "linear"));
      seguidos = dinamico ? 0 : seguidos + pedacos(fila[j]);
      anteriorDinamico = dinamico;
    }
    inicio = ate + 1;
  }
  return {blocks: saida, families};
};

// Um pacote usado na escolha de layouts. No modo de um pacote, prefix é "" e os
// layouts guardam o nome do arquivo ("b4"); no modo misto, prefix é "<pacote>/"
// e os layouts guardam o nome completo ("b/b4"), sem confusão entre pacotes.
export type PackageRules = {
  name: string;
  prefix: string;
  templates: Record<string, CaptionTemplate>;
  config: PackageConfig;
};

type Picker = ReturnType<typeof createLayoutPicker>;

// Layout de um bloco quando a palavra-chave é trocada à mão, com o prefixo do pacote.
export const layoutForKeywordIn = (
  block: AssignedCaptionBlock,
  keywordIndex: number,
  rules: PackageRules,
): string => {
  const local =
    rules.prefix && block.template.startsWith(rules.prefix)
      ? block.template.slice(rules.prefix.length)
      : block.template;
  return rules.prefix + layoutForKeyword({...block, template: local}, keywordIndex, rules.config);
};

// Escolhe o layout de um bloco com as regras de um pacote. Devolve o bloco pronto e
// quantos blocos da lista ele consumiu (2 quando junta com o seguinte, regra b).
const arrangeBlock = (
  blocks: CaptionBlock[],
  families: TemplateFamily[],
  index: number,
  rules: PackageRules,
  picker: Picker,
  // Pode formar uma dupla aqui (respeita o intervalo mínimo entre duplas).
  pairAllowed = false,
): {
  block: AssignedCaptionBlock;
  // Segundo bloco de uma dupla.
  partner?: AssignedCaptionBlock;
  // Demais partes de um linear dividido (acima de maxLinearWords ou maxLinearCaracteres).
  rest?: AssignedCaptionBlock[];
  consumed: number;
} => {
  const block = blocks[index];
  const linear = (): AssignedCaptionBlock => ({
    ...block,
    dupla: undefined,
    pacote: rules.name,
    family: "linear",
    template: rules.prefix + rules.config.linear,
  });
  const highlight = (base: CaptionBlock, choice: HighlightChoice): AssignedCaptionBlock => ({
    ...base,
    dupla: undefined,
    pacote: rules.name,
    keyword: base.words[choice.keywordIndex].text,
    family: "destaque",
    template: rules.prefix + choice.template,
  });

  if (families[index] === "linear") {
    const {maxLinearWords, maxLinearCaracteres} = rules.config;
    if (!linearCabe(rules.config, textsOf(block))) {
      const [firstWords, ...others] = dividirLinear(
        block.words,
        maxLinearWords ?? Number.POSITIVE_INFINITY,
        maxLinearCaracteres ?? Number.POSITIVE_INFINITY,
      );
      const part = (words: Word[]): AssignedCaptionBlock => ({
        ...linear(),
        words,
        startMs: words[0].startMs,
        endMs: words[words.length - 1].endMs,
        keyword: chooseKeyword(words),
      });
      return {block: part(firstWords), rest: others.map(part), consumed: 1};
    }
    return {block: linear(), consumed: 1};
  }

  // Dupla: este destaque e o bloco seguinte (linear) na tela ao mesmo tempo.
  const pair = pairAllowed ? arrangePair(blocks, families, index, rules) : undefined;
  if (pair) {
    return {block: pair[0], partner: pair[1], consumed: 2};
  }

  // Arranjo no próprio bloco (palavra-chave atual ou regra a).
  const withinBlock = picker.arrangeWithinBlock(
    block,
    blocks[index + 1]?.startMs ?? Number.POSITIVE_INFINITY,
  );
  if (withinBlock) {
    return {block: highlight(block, withinBlock), consumed: 1};
  }

  // Regra b: juntar com o bloco seguinte em três linhas. Só se o seguinte for
  // linear, o depois dele não for destaque (para não colar dois destaques),
  // não houver fim de frase entre eles e o total couber.
  const next = blocks[index + 1];
  const canMerge =
    next !== undefined &&
    !next.layoutManual &&
    families[index + 1] === "linear" &&
    families[index + 2] !== "destaque" &&
    !endsSentence(block.words[block.words.length - 1].text) &&
    block.words.length + next.words.length <= RHYTHM_CONFIG.maxWordsInThreeLines;
  if (canMerge) {
    const merged = mergeBlocks(block, next);
    const keywordIndex = threeLinesKeyword(
      merged,
      blocks[index + 2]?.startMs ?? Number.POSITIVE_INFINITY,
    );
    if (keywordIndex !== undefined) {
      return {block: highlight(merged, picker.threeLines(keywordIndex)), consumed: 2};
    }
  }

  // Regra c: palavra-chave primeiro e o resto embaixo; se a primeira palavra
  // não for forte, linear.
  return {
    block: isStrongWord(block.words[0].text) ? highlight(block, picker.threeLines(0)) : linear(),
    consumed: 1,
  };
};

// Palavra-chave para uma parte da dupla: linha de cima válida (pela estrutura da
// parte) e, se pedido, tempo suficiente na tela antes do bloco seguinte.
const pairPartKeyword = (
  block: CaptionBlock,
  structure: CaptionStructure,
  nextStartMs: number | undefined,
): number | undefined => {
  const texts = textsOf(block);
  const current = findKeywordIndex(block.words, block.keyword);
  return [current, ...keywordCandidates(texts).filter((index) => index !== current)].find(
    (index) =>
      isValidTopLine(topLineOf(structure, texts, index)) &&
      (nextStartMs === undefined || keywordVisibleEnough(block, index, nextStartMs)),
  );
};

// Tenta formar uma dupla com o destaque em index e o bloco seguinte: os dois com até
// dupla.maxPalavrasPorBloco palavras, separados por menos de dupla.intervaloMaximoMs,
// o seguinte linear e o depois dele não destaque (a dupla conta como um destaque).
const arrangePair = (
  blocks: CaptionBlock[],
  families: TemplateFamily[],
  index: number,
  rules: PackageRules,
): [AssignedCaptionBlock, AssignedCaptionBlock] | undefined => {
  const layout = rules.config.dupla;
  const pair = layout ? rules.templates[layout]?.pair : undefined;
  const first = blocks[index];
  const second = blocks[index + 1];
  const {maxPalavrasPorBloco, intervaloMaximoMs} = AGRUPAMENTO_CONFIG.dupla;
  if (
    !layout ||
    !pair ||
    !second ||
    second.layoutManual ||
    families[index + 1] !== "linear" ||
    families[index + 2] === "destaque" ||
    first.words.length > maxPalavrasPorBloco ||
    second.words.length > maxPalavrasPorBloco ||
    second.startMs - first.endMs >= intervaloMaximoMs
  ) {
    return undefined;
  }
  const firstKeyword = pairPartKeyword(first, pair.first.structure, undefined);
  const secondKeyword = pairPartKeyword(second, pair.second.structure, blocks[index + 2]?.startMs ?? Number.POSITIVE_INFINITY);
  if (firstKeyword === undefined || secondKeyword === undefined) {
    return undefined;
  }
  const member = (block: CaptionBlock, keywordIndex: number, role: "primeiro" | "segundo"): AssignedCaptionBlock => ({
    ...block,
    pacote: rules.name,
    keyword: block.words[keywordIndex].text,
    family: "destaque",
    template: rules.prefix + layout,
    dupla: role,
  });
  return [member(first, firstKeyword, "primeiro"), member(second, secondKeyword, "segundo")];
};

// Núcleo da escolha de layouts. Para cada bloco, candidatesFor diz quais pacotes
// usar, em ordem de preferência. Um destaque nunca repete o layout do destaque
// anterior quando há outro pacote que dê um layout diferente. Blocos com layout
// escolhido à mão ficam como estão.
const distribute = (
  entrada: CaptionBlock[],
  candidatesFor: (block: CaptionBlock, family: TemplateFamily) => PackageRules[],
  isKnownTemplate: (name: string) => boolean,
  // Avisa qual pacote foi usado (pode não ser o primeiro candidato).
  onUsed: (rules: PackageRules) => void = () => undefined,
  // Ritmo próprio do pacote (só no modo de um pacote), com os limites do linear dele.
  ritmo?: {ritmo: NonNullable<PackageConfig["ritmo"]>; limites: PalavrasDoLinear},
): AssignedCaptionBlock[] => {
  // O ritmo próprio pode dividir um linear longo em pedaços (um deles vira dinâmico).
  const {blocks, families} = ritmo
    ? familiasDoRitmo(entrada, ritmo.ritmo, ritmo.limites)
    : {blocks: entrada, families: assignFamilies(entrada)};
  const pickers = new Map<string, Picker>();
  const pickerOf = (rules: PackageRules): Picker => {
    let picker = pickers.get(rules.name);
    if (!picker) {
      picker = createLayoutPicker(rules.config, rules.templates);
      pickers.set(rules.name, picker);
    }
    return picker;
  };

  const assigned: AssignedCaptionBlock[] = [];
  let lastHighlight: string | undefined;
  let lastPairIndex = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < blocks.length; ) {
    const pairAllowed = index - lastPairIndex >= AGRUPAMENTO_CONFIG.dupla.aCadaBlocos;
    const block = blocks[index];
    if (block.layoutManual && block.family && isKnownTemplate(block.template)) {
      const manual = block as AssignedCaptionBlock;
      assigned.push(manual);
      if (manual.family === "destaque") {
        lastHighlight = manual.template;
      }
      index++;
      continue;
    }

    const [first, ...others] = candidatesFor(block, families[index]);
    let used = first;
    let result = arrangeBlock(blocks, families, index, first, pickerOf(first), pairAllowed);
    if (result.block.family === "destaque" && result.block.template === lastHighlight) {
      for (const alternative of others) {
        const attempt = arrangeBlock(blocks, families, index, alternative, pickerOf(alternative), pairAllowed);
        if (attempt.block.template !== lastHighlight) {
          result = attempt;
          used = alternative;
          break;
        }
      }
    }
    onUsed(used);
    if (result.block.family === "destaque") {
      lastHighlight = result.block.template;
    }
    assigned.push(result.block);
    if (result.partner) {
      assigned.push(result.partner);
      lastPairIndex = index;
    }
    if (result.rest) {
      assigned.push(...result.rest);
    }
    index += result.consumed;
  }
  return assigned;
};

const keepSavedAssignments = (
  blocks: CaptionBlock[],
  templates: Record<string, CaptionTemplate>,
  options: RhythmOptions,
): AssignedCaptionBlock[] | undefined => {
  const fits = (block: CaptionBlock): boolean => {
    const template = templates[block.template ?? ""];
    return Boolean(template && block.family === template.family);
  };
  if (!options.preserveAssignments || options.templateChoice || !blocks.every(fits)) {
    return undefined;
  }
  const assigned = blocks as AssignedCaptionBlock[];
  // Dois destaques seguidos só acontecem por escolha manual: avisa, mas respeita.
  const repeated = assigned.findIndex(
    (block, index) => index > 0 && block.family === "destaque" && assigned[index - 1].family === "destaque",
  );
  if (repeated > 0) {
    console.warn(`Aviso: os blocos ${repeated} e ${repeated + 1} são destaques seguidos (escolha manual).`);
  }
  return assigned;
};

export const assignRhythmAndTemplates = (
  blocks: CaptionBlock[],
  templates: Record<string, CaptionTemplate>,
  packageConfig: PackageConfig,
  options: RhythmOptions & {packageName?: string},
): AssignedCaptionBlock[] => {
  const saved = keepSavedAssignments(blocks, templates, options);
  if (saved) {
    return saved;
  }

  const forcedTemplateName =
    options.templateChoice && options.templateChoice !== "alternar"
      ? options.templateChoice
      : undefined;
  if (forcedTemplateName && !templates[forcedTemplateName]) {
    throw new Error(`Template '${options.templateChoice}' não encontrado.`);
  }
  if (forcedTemplateName) {
    const family = templates[forcedTemplateName].family;
    return blocks.map((block) => ({...block, family, template: forcedTemplateName}));
  }

  const rules: PackageRules = {name: options.packageName ?? "", prefix: "", templates, config: packageConfig};
  const ritmo = packageConfig.ritmo ? {ritmo: packageConfig.ritmo, limites: packageConfig} : undefined;
  return distribute(blocks, () => [rules], (name) => Boolean(templates[name]), undefined, ritmo).map((block) =>
    options.packageName ? block : {...block, pacote: undefined},
  );
};

// Gerador pseudoaleatório com semente (mulberry32): o mesmo sorteio na prévia e no render.
export const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

// Modo misto: cada bloco sorteia um pacote e usa as regras dele. Os pacotes saem
// de um "saco" embaralhado: todos aparecem antes de algum repetir.
export const assignMixed = (
  blocks: CaptionBlock[],
  packages: PackageRules[],
  seed: number,
  options: RhythmOptions,
): AssignedCaptionBlock[] => {
  const templates = Object.fromEntries(
    packages.flatMap((rules) =>
      Object.entries(rules.templates).map(([name, template]) => [rules.prefix + name, template]),
    ),
  );
  const saved = keepSavedAssignments(blocks, templates, options);
  if (saved) {
    return saved;
  }

  const random = createRandom(seed);
  let bag: PackageRules[] = [];
  const shuffled = (): PackageRules[] => {
    const copy = [...packages];
    for (let index = copy.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  };
  let drawn: PackageRules | undefined;
  // Um linear com mais palavras que o máximo de um pacote não sorteia esse pacote.
  const accepts = (rules: PackageRules, block: CaptionBlock, family: TemplateFamily): boolean =>
    family !== "linear" || linearCabe(rules.config, textsOf(block));
  const candidatesFor = (block: CaptionBlock, family: TemplateFamily): PackageRules[] => {
    if (bag.length === 0) {
      bag = shuffled();
    }
    // O primeiro do saco que aceita o bloco (os outros continuam no saco, na ordem).
    // Se nenhum pacote aceita, segue o sorteio normal e o linear é dividido.
    const usable = packages.some((rules) => accepts(rules, block, family));
    if (usable && !bag.some((rules) => accepts(rules, block, family))) {
      bag = [...bag, ...shuffled()];
    }
    const position = usable ? bag.findIndex((rules) => accepts(rules, block, family)) : 0;
    drawn = bag.splice(position, 1)[0];
    // Alternativas, se o layout repetir o do destaque anterior: primeiro os que
    // ainda estão no saco, depois os demais.
    return [drawn, ...bag, ...packages.filter((rules) => rules !== drawn && !bag.includes(rules))].filter(
      (rules, index) => index === 0 || accepts(rules, block, family),
    );
  };
  // Se outro pacote foi usado no lugar do sorteado, os dois trocam de lugar no
  // saco: o sorteado volta e sai no próximo bloco, e o equilíbrio se mantém.
  const onUsed = (used: PackageRules): void => {
    if (drawn && used !== drawn) {
      const position = bag.indexOf(used);
      if (position >= 0) {
        bag.splice(position, 1);
      }
      bag.unshift(drawn);
    }
  };
  return distribute(blocks, candidatesFor, (name) => Boolean(templates[name]), onUsed);
};
