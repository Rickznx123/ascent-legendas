import type {CSSProperties} from "react";
import type {EntranceAnimation} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE B — cópia do CSS de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 * Medidas em cqw = % da largura do vídeo (1cqw em 1080px = 10,8px).
 *
 * Nenhuma cor fica aqui. As cores vêm da paleta (pasta paletas/):
 *   var(--cor-apoio)  texto que não é palavra-chave (branco nas paletas do B)
 *   var(--sombra)     sombra padrão (--sombra da referência)
 *   var(--brilho-1)   brilho perto da letra (--g1 da referência)
 *   var(--brilho-2)   brilho espalhado (--g2 da referência)
 *   var(--cor-sombra) cor da sombra
 * O degradê da palavra-chave (--chave) é aplicado pelo motor no .tx.
 */

// --sans e --didone
export const SANS = "'Inter Tight', Helvetica, Arial, sans-serif";
export const DIDONE = "'Playfair Display', Georgia, serif";

// .b — o bloco da legenda, centralizado a 68% da altura.
// Sem position/left/top: a posição vem da configuração do vídeo (src/posicao.ts).
export const BLOCO: CSSProperties = {
  width: "max-content",
  maxWidth: "90cqw",
  color: "var(--cor-apoio)",
  textAlign: "center",
  textShadow: "var(--sombra)",
  whiteSpace: "nowrap",
  fontFamily: SANS,
  fontSize: 16,
};

// .rot — rótulo sans 600.
export const ROTULO: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 600,
  fontSize: "4.6cqw",
  lineHeight: 1,
  letterSpacing: "-.01em",
  position: "relative",
  zIndex: 1,
};

// .forte — palavra pesada dentro de uma linha.
export const FORTE: CSSProperties = {
  fontWeight: 800,
  letterSpacing: "-.04em",
};

// .pesada — sans 800.
export const PESADA: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 800,
  letterSpacing: "-.045em",
  lineHeight: 0.88,
};

// .didone — serifada itálica de alto contraste.
export const DIDONE_ITALICA: CSSProperties = {
  fontFamily: DIDONE,
  fontStyle: "italic",
  fontWeight: 500,
  letterSpacing: "-.03em",
  lineHeight: 0.9,
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

// .tx — o texto da palavra-chave. A folga interna nas laterais impede que as
// letras itálicas sejam cortadas pelo degradê recortado no texto.
export const TX: CSSProperties = {
  display: "inline-block",
  padding: ".06em .14em",
  margin: "-.06em -.14em",
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

// @keyframes foco — .55s, mesma curva
export const FOCO: EntranceAnimation = {
  durationMs: 550,
  easing: [0.2, 0.8, 0.2, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0.12,
  fromScale: 0.94,
};
