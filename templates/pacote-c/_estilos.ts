import type {CSSProperties} from "react";
import type {EntranceAnimation} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE C — cópia do CSS de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 * Medidas em cqw = % da largura do vídeo (1cqw em 1080px = 10,8px).
 *
 * Nenhuma cor fica aqui. As cores vêm da paleta (pasta paletas/):
 *   var(--cor-apoio)  texto que não é palavra-chave
 *   var(--sombra)     sombra padrão (--sombra da referência)
 *   var(--brilho-1)   brilho perto da letra (--g1)
 *   var(--brilho-2)   brilho espalhado (--g2)
 *   var(--cor-sombra) cor da sombra
 * O degradê da palavra-chave (--chave) é aplicado pelo motor no .tx.
 * Caixa-alta e minúsculas vêm de text-transform: o texto do JSON não muda.
 * Inclinações (rotate) ficam na linha ou no elemento de fora da palavra-chave,
 * nunca na palavra animada.
 */

// --anton e --script
export const FONTE_ANTON = "'Anton', 'Arial Narrow', Impact, sans-serif";
export const FONTE_SCRIPT = "'Kaushan Script', 'Brush Script MT', cursive";

// .b — o bloco da legenda, centralizado a 68% da altura.
// Sem position/left/top: a posição vem da configuração do vídeo (src/posicao.ts).
export const BLOCO: CSSProperties = {
  width: "max-content",
  maxWidth: "90cqw",
  color: "var(--cor-apoio)",
  textAlign: "center",
  textShadow: "var(--sombra)",
  whiteSpace: "nowrap",
  fontSize: 16,
};

// .anton — condensada em caixa-alta.
export const ANTON: CSSProperties = {
  fontFamily: FONTE_ANTON,
  fontWeight: 400,
  textTransform: "uppercase",
  letterSpacing: ".005em",
  lineHeight: 1,
};

// .script — manuscrita, sempre em minúsculas.
export const SCRIPT: CSSProperties = {
  fontFamily: FONTE_SCRIPT,
  fontWeight: 400,
  textTransform: "lowercase",
  letterSpacing: 0,
  lineHeight: 1,
};

// .rot — rótulo pequeno: condensada espaçada.
export const ROTULO: CSSProperties = {
  fontFamily: FONTE_ANTON,
  fontWeight: 400,
  fontSize: "4.8cqw",
  lineHeight: 1,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  position: "relative",
  zIndex: 1,
};

// .dois — duas palavras nas pontas da linha.
export const DOIS: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0 .3em",
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
  padding: ".1em .16em",
  margin: "-.1em -.16em",
  textShadow: "none",
};

// .tx.script — a manuscrita precisa de mais folga para o degradê não cortar as pontas.
export const TX_SCRIPT: CSSProperties = {
  ...TX,
  padding: ".22em .28em",
  margin: "-.22em -.28em",
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

// @keyframes bate — .38s cubic-bezier(.2,.9,.25,1): palavra-chave condensada
export const BATE: EntranceAnimation = {
  durationMs: 380,
  easing: [0.2, 0.9, 0.25, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0.05,
  fromScale: 1.22,
};

// @keyframes foco — .55s: palavra-chave manuscrita
export const FOCO: EntranceAnimation = {
  durationMs: 550,
  easing: [0.2, 0.8, 0.2, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0.12,
  fromScale: 0.94,
};
