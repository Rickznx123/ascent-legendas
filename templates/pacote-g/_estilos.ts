import type {CSSProperties} from "react";
import type {EntranceAnimation} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE G — cópia do CSS de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 * Medidas em cqw = % da largura do vídeo (1cqw em 1080px = 10,8px).
 *
 * Nenhuma cor fica aqui. As cores vêm da paleta (pasta paletas/):
 *   var(--cor-apoio)  texto que não é palavra-chave (branco)
 *   var(--brilho-1)   brilho perto da letra (--g1 da referência)
 *   var(--brilho-2)   brilho espalhado (--g2 da referência)
 *   var(--cor-sombra) cor da sombra
 * O degradê da palavra-chave (--chave) é aplicado pelo motor no .tx.
 * Tudo em Montserrat Bold; o texto aparece como foi transcrito.
 */

// --sans
export const SANS = "'Montserrat', Helvetica, Arial, sans-serif";

// --sombra-linear: sombra escura fixa, sem brilho, igual em todas as paletas.
export const SOMBRA_LINEAR = "0 .25cqw .5cqw rgba(0,0,0,.55), 0 .6cqw 2.4cqw rgba(0,0,0,.45)";

// --sombra da referência: no G o apoio também brilha, com as cores da paleta.
export const SOMBRA =
  "0 0 .35cqw var(--brilho-1), 0 0 1.6cqw var(--brilho-2), " +
  "0 .4cqw 1.6cqw color-mix(in srgb, var(--cor-sombra) 55%, transparent)";

// .b — o bloco da legenda.
// Sem position/left/top: a posição vem da configuração do vídeo (src/posicao.ts).
export const BLOCO: CSSProperties = {
  width: "max-content",
  maxWidth: "90cqw",
  color: "var(--cor-apoio)",
  textAlign: "center",
  textShadow: SOMBRA,
  whiteSpace: "nowrap",
  fontFamily: SANS,
  fontWeight: 700,
  fontSize: 16,
};

// .apoio — bold.
export const APOIO: CSSProperties = {
  fontWeight: 700,
  letterSpacing: "-.02em",
  lineHeight: 1,
};

// .forte — palavra-chave bold. Família repetida aqui porque a medida da
// palavra-chave (data-w) lê só o estilo dela.
export const FORTE: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 700,
  letterSpacing: "-.03em",
  lineHeight: 0.92,
};

// .rot — rótulo comercial: caixa-alta pequena e espaçada.
export const ROTULO: CSSProperties = {
  fontWeight: 700,
  fontSize: "4.2cqw",
  letterSpacing: ".16em",
  textTransform: "uppercase",
  lineHeight: 1,
};

// .dois — duas palavras nas pontas da linha.
export const DOIS: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "0 .2em",
};

// .kw — elemento de fora da palavra-chave: o brilho fica aqui, não no texto.
export const KW: CSSProperties = {
  display: "block",
  filter:
    "drop-shadow(0 0 .5cqw var(--brilho-1)) drop-shadow(0 0 3cqw var(--brilho-2)) " +
    "drop-shadow(0 .5cqw 1.6cqw color-mix(in srgb, var(--cor-sombra) 45%, transparent))",
};

// .tx — o texto da palavra-chave, com folga para o degradê recortado.
export const TX: CSSProperties = {
  display: "inline-block",
  padding: ".06em .1em",
  margin: "-.06em -.1em",
  textShadow: "none",
};

// @keyframes sobe — .42s cubic-bezier(.2,.8,.2,1)
export const SOBE: EntranceAnimation = {
  durationMs: 420,
  easing: [0.2, 0.8, 0.2, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0.3,
  fromBlurEm: 0,
  fromScale: 1,
};

// @keyframes acende — .6s cubic-bezier(.16,1,.3,1): entra estourando de luz e assenta.
// 0%: opacidade 0, desfoque .1em, brilho 2,2, escala .95; 45%: opacidade 1, sem
// desfoque, brilho 1,6; 100%: normal.
export const ACENDE: EntranceAnimation = {
  durationMs: 600,
  easing: [0.16, 1, 0.3, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0.1,
  fromScale: 0.95,
  keyframes: {
    opacity: [
      [0, 0],
      [0.45, 1],
      [1, 1],
    ],
    brightness: [
      [0, 2.2],
      [0.45, 1.6],
      [1, 1],
    ],
    blur: [
      [0, 0.1],
      [0.45, 0],
      [1, 0],
    ],
  },
};

// @keyframes lado — .5s, mesma curva do acende: desliza da esquerda.
export const LADO: EntranceAnimation = {
  durationMs: 500,
  easing: [0.16, 1, 0.3, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromTranslateXEm: -0.6,
  fromBlurEm: 0,
  fromScale: 1,
};
