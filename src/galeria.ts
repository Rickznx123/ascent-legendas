// Galeria de templates: blocos de mentira para desenhar cada layout numa
// miniatura com o motor real. Funções puras (sem Node).
import type {AssignedCaptionBlock, CaptionTemplate, Word} from "./types";

// Palavras de uma miniatura e qual delas é a palavra-chave.
export type TextoDaMiniatura = {
  palavras: string[];
  palavraChave: string;
  // Só para layouts de dupla: o segundo bloco (sem ele, as palavras são divididas).
  seguinte?: {palavras: string[]; palavraChave: string};
};

// Texto usado quando o pacote não define o próprio exemplo (_pacote.ts → exemplo).
export const EXEMPLO_PADRAO: TextoDaMiniatura = {palavras: ["o", "seu", "texto", "de", "exemplo"], palavraChave: "texto"};

export const textoDoExemplo = (exemplo: {texto: string; palavraChave: string} | undefined): TextoDaMiniatura =>
  exemplo ? {palavras: exemplo.texto.split(/\s+/u).filter(Boolean), palavraChave: exemplo.palavraChave} : EXEMPLO_PADRAO;

// Cada palavra é "falada" PASSO_MS depois da anterior, a partir de INICIO_MS.
const INICIO_MS = 300;
const PASSO_MS = 240;
// Folga depois da animação mais longa, para o quadro mostrar tudo já parado.
const FOLGA_MS = 80;
// Quanto tempo a miniatura continua depois do quadro com tudo visível (ao passar o mouse).
const DEPOIS_MS = 900;

export type Miniatura = {
  blocks: AssignedCaptionBlock[];
  // Quadro em que o bloco (ou a dupla) está todo na tela.
  quadroVisivel: number;
  duracaoEmQuadros: number;
};

const duracaoMaximaMs = (template: CaptionTemplate): number => {
  const {animations} = template;
  return Math.max(
    ...[
      animations.word,
      animations.keyword,
      animations.top,
      animations.complement,
      animations.below,
      animations.labelLeft,
      animations.labelRight,
      ...(animations.linearPair ?? []),
    ].map((animation) => animation?.durationMs ?? 0),
  );
};

// Divide as palavras em dois blocos para uma dupla sem bloco seguinte.
const dividirParaDupla = (texto: TextoDaMiniatura): [TextoDaMiniatura, TextoDaMiniatura] => {
  if (texto.seguinte) {
    return [texto, {...texto.seguinte}];
  }
  if (texto.palavras.length < 2) {
    return [texto, texto];
  }
  const meio = Math.ceil(texto.palavras.length / 2);
  const primeira = texto.palavras.slice(0, meio);
  const segunda = texto.palavras.slice(meio);
  const chaveNa = (parte: string[]) =>
    parte.includes(texto.palavraChave) ? texto.palavraChave : [...parte].sort((a, b) => b.length - a.length)[0];
  return [
    {palavras: primeira, palavraChave: chaveNa(primeira)},
    {palavras: segunda, palavraChave: chaveNa(segunda)},
  ];
};

// Blocos de uma miniatura do layout `chave` (como nos blocos do vídeo: "d/d4").
export const montarMiniatura = (
  chave: string,
  template: CaptionTemplate,
  texto: TextoDaMiniatura,
  fps: number,
): Miniatura => {
  let tempo = INICIO_MS;
  const palavrasCom = (palavras: string[]): Word[] =>
    palavras.map((text) => {
      const word = {text, startMs: tempo, endMs: tempo + PASSO_MS};
      tempo += PASSO_MS;
      return word;
    });
  const bloco = (parte: TextoDaMiniatura, dupla?: "primeiro" | "segundo"): AssignedCaptionBlock => {
    const words = palavrasCom(parte.palavras.length > 0 ? parte.palavras : EXEMPLO_PADRAO.palavras);
    return {
      words,
      startMs: words[0].startMs,
      endMs: words[words.length - 1].endMs,
      keyword: parte.palavraChave,
      template: chave,
      family: template.family,
      layoutManual: true,
      dupla,
    };
  };
  const blocks =
    template.structure === "dupla"
      ? (([primeiro, segundo]) => [bloco(primeiro, "primeiro"), bloco(segundo, "segundo")])(dividirParaDupla(texto))
      : [bloco(texto)];
  const ultima = blocks[blocks.length - 1].words.at(-1)!;
  const visivelMs = ultima.startMs + duracaoMaximaMs(template) + FOLGA_MS;
  const quadroVisivel = Math.ceil((visivelMs / 1000) * fps);
  return {blocks, quadroVisivel, duracaoEmQuadros: quadroVisivel + Math.ceil((DEPOIS_MS / 1000) * fps)};
};
