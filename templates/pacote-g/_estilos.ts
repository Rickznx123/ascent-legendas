import type {CSSProperties} from "react";
import type {CaptionTemplate, ConfigDosPapeis, EntranceAnimation, KeywordFit, Papel} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE G — cópia do CSS de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 *
 * Os layouts usam a estrutura "papeis" palavra por palavra (src/papeis.ts), com o
 * ajuste do bloco inteiro (data-w e data-max da referência): os tamanhos, recuos e
 * espaços estão em em da letra do bloco, como no CSS.
 *
 * Cores: a pesada tem o degradê metálico fixo (--metal); a palavra-chave usa o
 * degradê da paleta (var(--chave)). O brilho do bloco vem da paleta:
 *   var(--brilho-1)  brilho perto da letra (--g1 da referência)
 *   var(--brilho-2)  brilho espalhado (--g2 da referência)
 *   var(--l1), var(--l2)  glow do linear
 */

// --sans e --serifa
export const SANS = "'Montserrat', Helvetica, Arial, sans-serif";
export const SERIFA = "'Instrument Serif', Georgia, serif";

// --metal: branco que escurece para cinza embaixo.
const METAL = "linear-gradient(180deg,#ffffff 0%,#ffffff 42%,#c3c3cb 100%)";

// .b — o bloco, alinhado à esquerda, tudo em minúsculas. O brilho fica aqui (filter),
// não no texto recortado. Sem position/left/top: a posição vem do vídeo (src/posicao.ts).
const BLOCO: CSSProperties = {
  width: "max-content",
  maxWidth: "90cqw",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  color: "#fff",
  whiteSpace: "nowrap",
  fontFamily: SANS,
  textTransform: "lowercase",
  textAlign: "left",
  filter: "drop-shadow(0 0 .5cqw var(--brilho-1)) drop-shadow(0 0 2.4cqw var(--brilho-2)) drop-shadow(0 .35cqw .9cqw rgba(0,0,0,.6))",
};

// .lin — o linear: glow forte no texto e sombra escura no bloco.
const BLOCO_LINEAR: CSSProperties = {
  ...BLOCO,
  textShadow: "0 0 .25cqw var(--l1), 0 0 1.6cqw var(--l2), 0 0 4cqw var(--l2)",
  filter: "drop-shadow(0 .3cqw .8cqw rgba(0,0,0,.45))",
};

// Uma linha: as palavras lado a lado, na mesma linha de base.
const LINHA: CSSProperties = {display: "flex", alignItems: "baseline", whiteSpace: "nowrap"};

// .pesada — Montserrat 900 bem apertada, com o degradê metálico recortado no texto.
const PESADA: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 900,
  letterSpacing: "-.055em",
  lineHeight: 1,
  textTransform: "lowercase",
  backgroundImage: METAL,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
  display: "inline-block",
  padding: ".04em .06em",
  margin: "-.04em -.06em",
};

// .serifa — Instrument Serif itálica fina, branca.
const SERIFA_BRANCA: CSSProperties = {
  fontFamily: SERIFA,
  fontStyle: "italic",
  fontWeight: 400,
  letterSpacing: "-.025em",
  lineHeight: 1,
  textTransform: "lowercase",
  color: "#f6f6f6",
};

// .lin .t — Montserrat 600 apertada.
const LINEAR: CSSProperties = {fontFamily: SANS, fontWeight: 600, letterSpacing: "-.045em", lineHeight: 1, textTransform: "lowercase", color: "#fff"};

const ESTILOS: Partial<Record<Papel, CSSProperties>> = {
  pesada: PESADA,
  "pesada-pequena": PESADA,
  // .g1 .l2 .con
  conectivo: {...PESADA, letterSpacing: "-.04em"},
  "serifa-branca": SERIFA_BRANCA,
  // .chave — a mesma pesada, pintada pela paleta.
  chave: {...PESADA, backgroundImage: "var(--chave)"},
  linear: LINEAR,
  // .lin .co — conectivo curto com 40%, sem espaço em volta.
  "linear-conectivo": {...LINEAR, letterSpacing: 0, margin: "0 .06em"},
};

// @keyframes sobe — .42s cubic-bezier(.2,.8,.2,1): as pesadas.
const SOBE: EntranceAnimation = {
  durationMs: 420,
  easing: [0.2, 0.8, 0.2, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0.3,
  fromBlurEm: 0,
  fromScale: 1,
};

// @keyframes acende — .6s cubic-bezier(.16,1,.3,1): a palavra-chave.
// 0%: opacidade 0, desfoque .08em, brilho 2, escala .95; 45%: opacidade 1, sem
// desfoque, brilho 1,5; 100%: normal.
const ACENDE: EntranceAnimation = {
  durationMs: 600,
  easing: [0.16, 1, 0.3, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0.08,
  fromScale: 0.95,
  keyframes: {
    opacity: [
      [0, 0],
      [0.45, 1],
      [1, 1],
    ],
    brightness: [
      [0, 2],
      [0.45, 1.5],
      [1, 1],
    ],
    blur: [
      [0, 0.08],
      [0.45, 0],
      [1, 0],
    ],
  },
};

// @keyframes desliza — .5s cubic-bezier(.16,1,.3,1): a serifa vem da esquerda, saindo do desfoque.
const DESLIZA: EntranceAnimation = {
  durationMs: 500,
  easing: [0.16, 1, 0.3, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromTranslateXEm: -0.5,
  fromBlurEm: 0.08,
  fromScale: 1,
};

// @keyframes surge — .4s ease: o linear, palavra por palavra.
const SURGE: EntranceAnimation = {
  durationMs: 400,
  easing: [0.25, 0.1, 0.25, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0.15,
  fromBlurEm: 0.12,
  fromScale: 1,
};

const ANIMACOES: Partial<Record<Papel, EntranceAnimation>> = {
  pesada: SOBE,
  "pesada-pequena": SOBE,
  conectivo: SOBE,
  "serifa-branca": DESLIZA,
  chave: ACENDE,
  linear: SURGE,
  "linear-conectivo": SURGE,
};

// Um espaço comum entre duas palavras, em em da palavra (Montserrat 900 ou 600
// apertada, e a serifa).
export const ESPACO = 0.22;
const ESPACO_SERIFA = 0.2;

type Layout = {
  arranjo: ConfigDosPapeis["arranjo"];
  // data-w e data-max da referência.
  ajuste: KeywordFit;
  // Tamanho de cada papel em em da letra do bloco (os que faltarem valem 1).
  tamanhos?: Partial<Record<Papel, number>>;
  linhas?: ConfigDosPapeis["linhas"];
  // Estilos que mudam neste layout.
  estilos?: Partial<Record<Papel, CSSProperties>>;
};

// Um layout do pacote G.
export const layout = ({arranjo, ajuste, tamanhos = {}, linhas, estilos = {}}: Layout): CaptionTemplate => {
  const linear = arranjo === "linear-uma-linha" || arranjo === "linear-duas-linhas";
  const tamanhosCqw: Partial<Record<Papel, number>> = {
    pesada: 1,
    "pesada-pequena": 1,
    conectivo: 1,
    "serifa-branca": 1,
    chave: 1,
    linear: 1,
    "linear-conectivo": 0.4,
    ...tamanhos,
  };
  // Espaço entre palavras do mesmo papel, em em da linha: o espaço da fonte no tamanho do papel.
  const t = (papel: Papel) => tamanhosCqw[papel] ?? 1;
  return {
    family: linear ? "linear" : "destaque",
    structure: "papeis",
    keywordEffect: "brilho",
    styles: {block: linear ? BLOCO_LINEAR : BLOCO},
    papeis: {
      arranjo,
      estilos: {...ESTILOS, ...estilos},
      tamanhosCqw,
      linha: LINHA,
      // Só o modo de linha inteira usa estes dois; no G cada papel tem a sua entrada.
      sobeCqw: 0,
      desfoqueCqw: 0,
      larguraMaximaCqw: 90,
      ajusteDoBloco: ajuste,
      linhas,
      porPalavra: {
        animacoes: ANIMACOES,
        padraoEm: 0.1,
        mesmoPapelEm: {
          pesada: ESPACO * t("pesada"),
          "pesada-pequena": ESPACO * t("pesada-pequena"),
          "serifa-branca": ESPACO_SERIFA * t("serifa-branca"),
          linear: ESPACO * t("linear"),
        },
      },
    },
    animations: linear ? {word: SURGE, keyword: SURGE} : {word: SOBE, keyword: ACENDE},
  };
};
