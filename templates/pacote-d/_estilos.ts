import type {CSSProperties} from "react";
import type {EntranceAnimation} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE D — cópia do CSS de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 * Medidas em cqw = % da largura do vídeo (1cqw em 1080px = 10,8px).
 *
 * Uma sans só (Hanken Grotesk), tudo em minúsculas via text-transform (o texto do
 * JSON não muda), bem apertada: apoio leve, palavra-chave pesada.
 *
 * Nenhuma cor fica aqui. As cores vêm da paleta (pasta paletas/):
 *   var(--cor-apoio)  texto que não é palavra-chave
 *   var(--cor-sombra) cor da sombra (a sombra do D é mais curta e mais escura)
 *   var(--brilho-1)   brilho perto da letra (--g1)
 *   var(--brilho-2)   brilho espalhado (--g2)
 * O degradê da palavra-chave (--chave) é aplicado pelo motor no .tx.
 */

// --sans
export const SANS = "'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

// --sombra: 0 .4cqw 2.4cqw rgba(0,0,0,.6)
export const SOMBRA = "0 .4cqw 2.4cqw color-mix(in srgb, var(--cor-sombra) 60%, transparent)";

// .b — o bloco da legenda, centralizado a 68% da altura.
// Sem position/left/top: a posição vem da configuração do vídeo (src/posicao.ts).
export const BLOCO: CSSProperties = {
  width: "max-content",
  maxWidth: "90cqw",
  color: "var(--cor-apoio)",
  textAlign: "center",
  textShadow: SOMBRA,
  whiteSpace: "nowrap",
  fontFamily: SANS,
  textTransform: "lowercase",
  fontSize: 16,
};

// .leve — apoio.
export const LEVE: CSSProperties = {
  fontWeight: 300,
  letterSpacing: "-.05em",
  lineHeight: 1,
};

// .forte — palavra-chave pesada. (fonte e minúsculas repetidas aqui para a medida
// da largura da palavra-chave, que não enxerga o que vem do bloco.)
export const FORTE: CSSProperties = {
  fontFamily: SANS,
  textTransform: "lowercase",
  fontWeight: 800,
  letterSpacing: "-.065em",
  lineHeight: 0.9,
};

// .dois — duas palavras nas pontas da linha.
export const DOIS: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0 .15em",
};

// .kw — elemento de fora da palavra-chave: o brilho fica aqui, não no texto.
export const KW: CSSProperties = {
  display: "block",
  filter:
    "drop-shadow(0 0 1.4cqw var(--brilho-1)) drop-shadow(0 0 5cqw var(--brilho-2)) " +
    "drop-shadow(0 .5cqw 2cqw color-mix(in srgb, var(--cor-sombra) 40%, transparent))",
};

// .tx — texto da palavra-chave, com folga interna para o degradê.
export const TX: CSSProperties = {
  display: "inline-block",
  padding: ".08em .1em",
  margin: "-.08em -.1em",
  textShadow: "none",
};

// @keyframes sobe — .45s cubic-bezier(.2,.8,.2,1)
export const SOBE: EntranceAnimation = {
  durationMs: 450,
  easing: [0.2, 0.8, 0.2, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0.35,
  fromBlurEm: 0,
  fromScale: 1,
};

// @keyframes foco — .55s
export const FOCO: EntranceAnimation = {
  durationMs: 550,
  easing: [0.2, 0.8, 0.2, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0.12,
  fromScale: 0.94,
};

// @keyframes pisca — .7s linear: acende, apaga e acende de novo.
//   0% opacity 0 · 10% 1 + brightness(1.6) · 20% .1 · 32% 1 + brightness(1.4)
//   44% .35 · 56% 1 · 100% 1. Onde o brilho não é dado, vale o normal (1).
export const PISCA: EntranceAnimation = {
  durationMs: 700,
  easing: [0, 0, 1, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0,
  fromScale: 1,
  keyframes: {
    opacity: [
      [0, 0],
      [0.1, 1],
      [0.2, 0.1],
      [0.32, 1],
      [0.44, 0.35],
      [0.56, 1],
      [1, 1],
    ],
    brightness: [
      [0, 1],
      [0.1, 1.6],
      [0.2, 1],
      [0.32, 1.4],
      [0.44, 1],
      [1, 1],
    ],
  },
};
