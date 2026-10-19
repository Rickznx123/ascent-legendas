import type {CSSProperties} from "react";
import type {CaptionTemplate, EntranceAnimation} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE H (CLÁSSICO) — cópia do CSS de referencia.html.
 * A prancha usa uma tela de 270px de largura: cada px dela vira px / 2,7 cqw
 * (1cqw = 1% da largura do vídeo; 17px → 6.296cqw, 10,8px em 1080).
 *
 * A frase entra inteira apagada e cada palavra se pinta durante a fala dela
 * (CaptionTemplate.pintura). A cor do preenchimento vem da paleta; o apagado é
 * branco translúcido, como na prancha.
 */

export const INTER = "'Inter', Helvetica, Arial, sans-serif";
export const SERIFA = "'Instrument Serif', Georgia, serif";

// Sombra escura na cor de sombra da paleta (rgba(0,0,0,a) da prancha).
const escura = (alfa: number) => `color-mix(in srgb, var(--cor-sombra) ${alfa}%, transparent)`;

// .p — drop-shadow(0 1px 1.5px rgba(0,0,0,.75)) drop-shadow(0 0 6px rgba(0,0,0,.35))
export const SOMBRA = `drop-shadow(0 .37cqw .556cqw ${escura(75)}) drop-shadow(0 0 2.222cqw ${escura(35)})`;
// .dark .p — drop-shadow(0 2px 3px rgba(0,0,0,.9)) drop-shadow(0 0 12px rgba(0,0,0,.6))
export const SOMBRA_DARK = `drop-shadow(0 .741cqw 1.111cqw ${escura(90)}) drop-shadow(0 0 4.444cqw ${escura(60)})`;

// Entrada da frase: fade de .15s (45% de branco no apagado; no Dark e nos dinâmicos 22%,
// com o preenchimento #F4F2EE no lugar do branco).
export const PINTURA: NonNullable<CaptionTemplate["pintura"]> = {apagada: 0.45, fadeMs: 150, sombra: SOMBRA};
export const PINTURA_DARK: NonNullable<CaptionTemplate["pintura"]> = {
  apagada: 0.22,
  fadeMs: 150,
  corSobreBranco: "#F4F2EE",
  sombra: SOMBRA_DARK,
};

// Saída: fade de .15s.
export const SAIDA: NonNullable<CaptionTemplate["saida"]> = {duracaoMs: 150, sobeCqw: 0, escala: 1};

// As palavras não têm entrada própria (quem entra é a frase, em PINTURA.fadeMs).
export const PARADA: EntranceAnimation = {
  durationMs: 150,
  easing: [0, 0, 1, 1],
  fromOpacity: 1,
  fromTranslateYEm: 0,
  fromBlurEm: 0,
  fromScale: 1,
};

// .dyn .chave — scale(.92) → scale(1) em .3s cubic-bezier(.2,.8,.2,1), na fala da chave.
export const ESCALA: EntranceAnimation = {...PARADA, durationMs: 300, easing: [0.2, 0.8, 0.2, 1], fromScale: 0.92};

// .tela::after das telas escuras: vinheta preta nos 42% de baixo (H3) ou 62% (dinâmicos).
export const VINHETA_DARK: CSSProperties = {
  height: "42%",
  background: "linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.5) 45%, transparent 100%)",
};
export const VINHETA_DINAMICO: CSSProperties = {
  height: "62%",
  background: "linear-gradient(to top, rgba(0,0,0,.9) 0%, rgba(0,0,0,.6) 50%, transparent 100%)",
};

// .legenda — left/right 8% (84% de largura), Inter 500 17px, line-height 1.28.
export const LEGENDA: CSSProperties = {
  width: "84cqw",
  textAlign: "center",
  fontFamily: INTER,
  fontWeight: 500,
  fontSize: "6.296cqw",
  lineHeight: 1.28,
  letterSpacing: "-.005em",
  whiteSpace: "normal",
};

// .linha
export const LINHA: CSSProperties = {display: "block"};

// .legenda bottom:16% — o centro de 1 a 2 linhas fica perto de 80% da altura.
export const LUGAR_LINEAR = {x: 50, y: 80};

// Até 24 caracteres por linha (acima disso, duas linhas).
export const CARACTERES_POR_LINHA = 24;

// .dyn — left/right 7% (86% de largura), top:60%.
export const DYN: CSSProperties = {
  width: "86cqw",
  textAlign: "center",
  fontFamily: INTER,
  whiteSpace: "normal",
};
export const LUGAR_DINAMICO = {x: 50, y: 60};

// .dyn .sup, .dyn .inf — Inter 500 15px, line-height 1.2.
export const APOIO: CSSProperties = {display: "block", fontWeight: 500, fontSize: "5.556cqw", lineHeight: 1.2};

// .dyn .meio
export const MEIO: CSSProperties = {display: "block", lineHeight: 1};

// A chave ocupa no máximo a largura do .dyn (palavras longas encolhem; as curtas
// ficam no tamanho da prancha, o teto).
export const LARGURA_DA_CHAVE = 86;
