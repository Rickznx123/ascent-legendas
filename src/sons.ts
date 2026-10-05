// Efeitos sonoros: quais blocos tocam, qual arquivo e quando. Funções puras (sem
// Node): a prévia e o render planejam igual, com a semente do transcricao.json.
import {findKeywordIndex, findProtectedSpans} from "./captions";
import {blocosNaTela} from "./entrada";
import {createRandom} from "./rhythm";
import {SONS_CONFIG} from "./sons-config";
import {computeTimeline} from "./tempos";
import type {AssignedCaptionBlock, CaptionTemplate, EfeitoSonoro, TemplateFamily} from "./types";

// Um arquivo da pasta sons/. A categoria é a subpasta ("destaque" ou "linear").
export type ArquivoSom = {arquivo: string; categoria: string; duracaoMs: number};

// Quadros de um efeito no vídeo: o primeiro em que o instante já chegou (o quadro
// em que a palavra entra) e quantos ele toca (com o som cortado, até o quadro em
// que o bloco já saiu).
export const quadrosDoEfeito = (efeito: EfeitoSonoro, fps: number): {inicio: number; quadros: number} => {
  const quadroDe = (ms: number) => Math.ceil((ms / 1000) * fps);
  const inicio = quadroDe(efeito.startMs);
  return {inicio, quadros: Math.max(1, quadroDe(efeito.startMs + efeito.duracaoMs) - inicio)};
};

// O que toca de cada efeito: um arquivo gerado a partir do som de sons/ (por
// src/motor/pasta-sons.ts), já com o corte e o fade, tocado com volume fixo. O
// volume calculado por quadro não vai para o arquivo final igual nos pedaços do
// Lambda. O nome guarda tudo o que a geração precisa:
//   tocados/<arquivo>-<quadros>q-<fps>fps-fade<ms>-folga<ms>.wav
export type SomTocado = {
  arquivo: string;
  // Quadros do som (sem a folga), fps, fade no fim (0: sem fade) e silêncio no
  // começo, em ms.
  quadros: number;
  fps: number;
  fadeMs: number;
  folgaMs: number;
};

// Nos pedaços do Lambda depois do primeiro, o Remotion corta o começo de cada som
// que começa dentro do pedaço (o ajuste da emenda do AAC, até uns 21 ms), e o
// clique inicial dos sons de digitação sumia. Cada som começa um quadro antes, com
// silêncio na frente: o corte cai no silêncio e o som sai no mesmo instante.
const FOLGA_EM_QUADROS = 1;

// Onde o Remotion põe o começo de um som que entra no quadro: em ms inteiros
// (adelay de stringify-ffmpeg-filter.js do @remotion/renderer).
const msDoQuadro = (quadro: number, fps: number): number => Number(((quadro / fps) * 1000).toFixed(0));

const NOME_DO_SOM_TOCADO =
  /^tocados\/(.+\.(?:wav|mp3))-(\d+)q-(\d+(?:\.\d+)?)fps-fade(\d+(?:\.\d+)?)-folga(\d+)\.wav$/iu;

// Arquivo (relativo a sons/), primeiro quadro e duração em quadros do que toca.
export const somTocado = (efeito: EfeitoSonoro, fps: number): {arquivo: string; de: number; quadros: number} => {
  const {inicio, quadros} = quadrosDoEfeito(efeito, fps);
  const de = Math.max(0, inicio - FOLGA_EM_QUADROS);
  // Silêncio exato até o ms em que o som começava, para ele sair na mesma amostra.
  const folgaMs = msDoQuadro(inicio, fps) - msDoQuadro(de, fps);
  return {
    arquivo: `tocados/${efeito.arquivo}-${quadros}q-${fps}fps-fade${efeito.fadeMs ?? 0}-folga${folgaMs}.wav`,
    de,
    quadros: quadros + (inicio - de),
  };
};

export const lerSomTocado = (relativo: string): SomTocado | undefined => {
  const partes = NOME_DO_SOM_TOCADO.exec(relativo);
  return partes
    ? {
        arquivo: partes[1],
        quadros: Number(partes[2]),
        fps: Number(partes[3]),
        fadeMs: Number(partes[4]),
        folgaMs: Number(partes[5]),
      }
    : undefined;
};

export type FrequenciaSom = "nenhum" | "poucos" | "metade" | "todos";

// Configuração salva no transcricao.json.
export type ConfigEfeitos = {
  // Frequência nos destaques e nos lineares.
  destaque: FrequenciaSom;
  linear: FrequenciaSom;
  // Volume geral dos efeitos, de 0 a 100.
  volume: number;
};

export const EFEITOS_PADRAO: ConfigEfeitos = {destaque: "metade", linear: "poucos", volume: 35};

// Configuração do projeto com os padrões. Projetos antigos tinham só
// "frequencia" (que valia para os destaques).
export const configDosEfeitos = (salvo: unknown): ConfigEfeitos => {
  const dados = (salvo ?? {}) as Partial<ConfigEfeitos> & {frequencia?: FrequenciaSom};
  return {
    destaque: dados.destaque ?? dados.frequencia ?? EFEITOS_PADRAO.destaque,
    linear: dados.linear ?? EFEITOS_PADRAO.linear,
    volume: dados.volume ?? EFEITOS_PADRAO.volume,
  };
};

// Valor de CaptionBlock.som para "sem som".
export const SEM_SOM = "nenhum";

// Quantos blocos automáticos formam um grupo; um de cada grupo toca.
const TAMANHO_DO_GRUPO: Record<FrequenciaSom, number> = {nenhum: 0, poucos: 3, metade: 2, todos: 1};

// Separa o sorteio dos sons do sorteio dos pacotes (mesma semente salva).
const SAL_DA_SEMENTE = 0x50e5;

// Categoria (subpasta de sons/) de um bloco: a família dele.
export const categoriaDoBloco = (block: AssignedCaptionBlock): TemplateFamily => block.family;

// Todo bloco pode ter som, menos o segundo de uma dupla.
export const blocoPodeTerSom = (block: AssignedCaptionBlock, template: CaptionTemplate | undefined): boolean =>
  Boolean(template) && block.dupla !== "segundo";

const nomeDoArquivo = (arquivo: string): string => arquivo.split("/").pop() ?? arquivo;

// Instante (de tela) em que a palavra-chave começa a entrar, como em KineticCaptionVideo:
// a fala dela, ou a entrada do bloco se ele entrou atrasado.
const entradaDaChaveMs = (block: AssignedCaptionBlock, template: CaptionTemplate, showMs: number): number => {
  let indice = findKeywordIndex(block.words, block.keyword);
  if (template.structure === "bloco") {
    indice = findProtectedSpans(block.words.map((word) => word.text)).spans[0]?.[0] ?? 0;
  }
  return Math.max(block.words[indice]?.startMs ?? block.startMs, showMs);
};

// Typing de um linear: o mais longo que cabe na entrada das palavras (da primeira
// palavra até o fim da animação da última). Com 2 palavras ou nada cabendo, o mais curto.
const typingDoLinear = (
  block: AssignedCaptionBlock,
  template: CaptionTemplate,
  entradaMs: number,
  opcoes: ArquivoSom[],
): ArquivoSom | undefined => {
  const porDuracao = [...opcoes].sort((a, b) => a.duracaoMs - b.duracaoMs || a.arquivo.localeCompare(b.arquivo));
  const ultima = block.words[block.words.length - 1];
  const entradaDasPalavrasMs = Math.max(ultima.startMs, entradaMs) + template.animations.word.durationMs - entradaMs;
  const cabem = porDuracao.filter((som) => som.duracaoMs <= entradaDasPalavrasMs);
  return block.words.length === 2 || cabem.length === 0 ? porDuracao[0] : cabem[cabem.length - 1];
};

// Planeja os efeitos do vídeo.
// - Escolhas manuais (CaptionBlock.som) valem sempre.
// - Os demais blocos seguem a frequência da família: em cada grupo de N blocos
//   automáticos, um sorteado toca, desde que nenhum vizinho tenha som. Os
//   destaques são sorteados antes; os lineares ocupam os espaços que sobram.
// - Destaque: arquivo sorteado de sons/destaque/, nunca o mesmo duas vezes
//   seguidas, alinhado à entrada da palavra-chave (menos a antecipação do arquivo).
// - Linear: typing de sons/linear/ na entrada da primeira palavra, cortado com
//   fade se passar do fim do bloco.
export const planejarEfeitos = (
  blocosDaFala: AssignedCaptionBlock[],
  templates: Record<string, CaptionTemplate>,
  sons: ArquivoSom[],
  config: ConfigEfeitos,
  semente: number,
  // Mesma sincronia das legendas: os sons seguem os tempos de tela.
  sincroniaMs = 0,
  // Instantes dos blocos excluídos (veja cortesDosExcluidos).
  cortesMs: number[] = [],
): EfeitoSonoro[] => {
  if (sons.length === 0) {
    return [];
  }
  const random = createRandom((semente ^ SAL_DA_SEMENTE) >>> 0);
  // Tempos de tela, os mesmos das legendas (veja src/entrada.ts).
  const blocks = blocosNaTela(blocosDaFala, templates, sincroniaMs);
  const timeline = computeTimeline(blocks, cortesMs);
  const daCategoria = (categoria: string) => sons.filter((som) => som.categoria === categoria);
  const manual = (block: AssignedCaptionBlock): ArquivoSom | undefined =>
    daCategoria(categoriaDoBloco(block)).find((som) => som.arquivo === block.som);
  const podeTer = (indice: number) => blocoPodeTerSom(blocks[indice], templates[blocks[indice].template]);

  // Blocos com som: primeiro os escolhidos à mão, depois um sorteado por grupo.
  const comSom = new Set(blocks.map((_, indice) => indice).filter((indice) => podeTer(indice) && manual(blocks[indice])));
  const grupos: number[][] = [];
  for (const familia of ["destaque", "linear"] as const) {
    const tamanho = TAMANHO_DO_GRUPO[config[familia]];
    const automaticos = blocks
      .map((_, indice) => indice)
      .filter(
        (indice) =>
          podeTer(indice) &&
          blocks[indice].family === familia &&
          blocks[indice].som !== SEM_SOM &&
          !manual(blocks[indice]) &&
          daCategoria(familia).length > 0,
      );
    for (let inicio = 0; tamanho > 0 && inicio < automaticos.length; inicio += tamanho) {
      grupos.push(automaticos.slice(inicio, inicio + tamanho));
    }
  }
  // Primeiro os grupos de destaque, depois os de linear (cada família na ordem do
  // vídeo): cada sorteio evita os vizinhos dos que já têm som.
  for (const grupo of grupos) {
    const livres = grupo.filter((indice) => !comSom.has(indice - 1) && !comSom.has(indice + 1));
    if (livres.length > 0) {
      comSom.add(livres[Math.floor(random() * livres.length)]);
    }
  }

  const efeitos: EfeitoSonoro[] = [];
  let destaqueAnterior: string | undefined;
  blocks.forEach((block, indice) => {
    const template = templates[block.template];
    if (!template || !comSom.has(indice)) {
      return;
    }
    const {showMs, hideMs} = timeline[indice];
    if (block.family === "destaque") {
      const opcoes = daCategoria("destaque");
      const semRepetir = opcoes.length > 1 ? opcoes.filter((som) => som.arquivo !== destaqueAnterior) : opcoes;
      const som = manual(block) ?? semRepetir[Math.floor(random() * semRepetir.length)];
      const antecipacao = SONS_CONFIG.antecipacaoMs[nomeDoArquivo(som.arquivo)] ?? 0;
      efeitos.push({
        bloco: indice,
        arquivo: som.arquivo,
        startMs: Math.max(0, entradaDaChaveMs(block, template, showMs) - antecipacao),
        duracaoMs: som.duracaoMs,
      });
      destaqueAnterior = som.arquivo;
      return;
    }
    const entradaMs = Math.max(block.words[0].startMs, showMs);
    const som = manual(block) ?? typingDoLinear(block, template, entradaMs, daCategoria("linear"));
    if (!som) {
      return;
    }
    const corta = entradaMs + som.duracaoMs > hideMs;
    efeitos.push({
      bloco: indice,
      arquivo: som.arquivo,
      startMs: entradaMs,
      duracaoMs: corta ? hideMs - entradaMs : som.duracaoMs,
      fadeMs: corta ? SONS_CONFIG.fadeDoCorteMs : undefined,
    });
  });
  return efeitos;
};
