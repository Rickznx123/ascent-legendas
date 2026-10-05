import type {CSSProperties} from "react";
import type {EntranceAnimation} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE E — cópia do CSS de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 * Medidas em cqw = % da largura do vídeo (1cqw em 1080px = 10,8px).
 *
 * Três fontes, uma por posição: sans geométrica itálica em cima (Urbanist Italic
 * no lugar da Creato Display), sans pesada no meio (Hanken Grotesk, a do pacote D)
 * e Garamond bold itálica embaixo (EB Garamond). Tudo em minúsculas via
 * text-transform (o texto do JSON não muda).
 *
 * As palavras entram deslizando de cima, de baixo, da esquerda ou da direita; cada
 * layout usa uma combinação diferente (animations.top, labelLeft, labelRight,
 * complement, below e keyword).
 *
 * Nenhuma cor fica aqui. As cores vêm da paleta (pasta paletas/):
 *   var(--cor-apoio)  texto que não é palavra-chave
 *   var(--cor-sombra) cor da sombra
 *   var(--brilho-1)   brilho perto da letra (--g1)
 *   var(--brilho-2)   brilho espalhado (--g2)
 * O degradê da palavra-chave (--chave) é aplicado pelo motor no .tx.
 */

// --cima, --meio e --baixo
// Só fontes de fontes/ (src/fontes.ts): uma fonte instalada no computador mudaria o
// render local e não existiria no Lambda.
export const FONTE_CIMA = "'Urbanist', 'Century Gothic', sans-serif";
export const FONTE_MEIO = "'Hanken Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";
export const FONTE_BAIXO = "'EB Garamond', Garamond, Georgia, serif";

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
  textTransform: "lowercase",
  fontSize: 16,
};

// .cima — EM CIMA: sans geométrica itálica.
export const CIMA: CSSProperties = {
  fontFamily: FONTE_CIMA,
  fontStyle: "italic",
  fontWeight: 500,
  letterSpacing: "-.02em",
  lineHeight: 1,
};

// .forte — NO MEIO: sans pesada. (minúsculas repetidas para a medida da largura)
export const FORTE: CSSProperties = {
  fontFamily: FONTE_MEIO,
  textTransform: "lowercase",
  fontWeight: 800,
  letterSpacing: "-.065em",
  lineHeight: 0.9,
};

// .gara — EMBAIXO: Garamond bold itálica.
export const GARA: CSSProperties = {
  fontFamily: FONTE_BAIXO,
  fontStyle: "italic",
  fontWeight: 700,
  letterSpacing: "-.02em",
  lineHeight: 0.95,
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

// @keyframes desliza — .5s cubic-bezier(.16,1,.3,1), de translate(--x, --y) a 0.
const desliza = (xEm: number, yEm: number): EntranceAnimation => ({
  durationMs: 500,
  easing: [0.16, 1, 0.3, 1],
  fromOpacity: 0,
  fromTranslateXEm: xEm,
  fromTranslateYEm: yEm,
  fromBlurEm: 0,
  fromScale: 1,
});

// Palavras de apoio: percurso de 1em na horizontal, 0,8em na vertical.
export const DE_ESQ = desliza(-1, 0);
export const DE_DIR = desliza(1, 0);
export const DE_CIMA = desliza(0, -0.8);
export const DE_BAIXO = desliza(0, 0.8);

// Palavra-chave: percurso menor, porque a letra é muito maior.
export const CHAVE_DE_ESQ = desliza(-0.4, 0);
export const CHAVE_DE_DIR = desliza(0.4, 0);
export const CHAVE_DE_CIMA = desliza(0, -0.35);
export const CHAVE_DE_BAIXO = desliza(0, 0.35);
