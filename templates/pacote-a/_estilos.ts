import type {CSSProperties} from "react";
import type {EntranceAnimation} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE A — cópia do CSS de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 * Medidas em cqw = % da largura do vídeo (1cqw em 1080px = 10,8px).
 *
 * Nenhuma cor fica aqui. As cores vêm da paleta (pasta paletas/) por meio das
 * variáveis CSS que o motor preenche:
 *   var(--cor-apoio)  cor do apoio, do complemento e do texto linear
 *   var(--sombra)     sombra padrão (--sombra da referência)
 *   var(--brilho)     brilho da palavra-chave (--brilho da referência)
 * O preenchimento da palavra-chave é aplicado pelo motor.
 */

// --sans e --serifa
export const SANS = "'Inter Tight', Helvetica, Arial, sans-serif";
export const SERIFA = "'Instrument Serif', Georgia, serif";

// .b — o bloco da legenda, centralizado a 68% da altura.
// Sem position/left/top: a posição vem da configuração do vídeo (src/posicao.ts).
export const BLOCO: CSSProperties = {
  width: "max-content",
  maxWidth: "86cqw",
  color: "var(--cor-apoio)",
  textAlign: "center",
  textShadow: "var(--sombra)",
  whiteSpace: "nowrap",
  fontFamily: SANS,
  fontSize: 16,
};

// .ap — palavras de apoio.
export const APOIO: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 500,
  fontSize: "5.4cqw",
  lineHeight: 1,
  letterSpacing: "-.01em",
};

// .pesada — sans 800.
export const PESADA: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 800,
  letterSpacing: "-.045em",
  lineHeight: 0.9,
};

// .italica — serifada itálica.
export const ITALICA: CSSProperties = {
  fontFamily: SERIFA,
  fontStyle: "italic",
  fontWeight: 400,
  letterSpacing: "-.02em",
  lineHeight: 0.9,
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
