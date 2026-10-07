import type {CSSProperties} from "react";
import type {CaptionTemplate, ConfigDosPapeis, EntranceAnimation, Papel} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE C (versão 2) — os valores de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 *
 * A prancha usa um vídeo de 360 x 640 px; aqui tudo está em cqw (% da largura do
 * vídeo), na mesma proporção: 1 px da prancha = 1/3,6 cqw (em 1080 px, 3 px).
 * Movimento a 30 quadros por segundo: 1 quadro = 33,3 ms.
 *
 * Nenhuma cor fica aqui. As cores vêm da paleta (pasta paletas/):
 *   var(--cor-apoio)    texto branco (corpo, leve, miudinho e o linear)
 *   var(--destaque)     destaque e gigante (com degradê, o motor recorta no texto)
 *   var(--caixa-fundo)  fundo da etiqueta
 *   var(--caixa-texto)  texto da etiqueta
 * Caixa alta vem de text-transform: o texto do JSON não muda.
 */

const PX = 100 / 360;
const px = (valor: number) => `${(valor * PX).toFixed(3)}cqw`;
const QUADRO_MS = 1000 / 30;

export const FONTE = "'Inter Tight', Helvetica, Arial, sans-serif";

// Sombras da prancha: 0 2px 8px (texto) e o brilho de 18 px do destaque gigante.
const SOMBRA_TEXTO = `0 ${px(2)} ${px(8)} rgba(0,0,0,.55)`;
const SOMBRA_COR = `0 ${px(2)} ${px(8)} rgba(0,0,0,.5)`;
const BRILHO = `0 0 ${px(18)} color-mix(in srgb, var(--destaque) 65%, transparent), ${SOMBRA_COR}`;

// .bloco — linhas empilhadas, caixa alta em itálico. A posição vem do layout
// (CaptionTemplate.posicao), deslocada pela posição geral do vídeo.
export const BLOCO: CSSProperties = {
  width: "max-content",
  maxWidth: "90cqw",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: px(1),
  fontFamily: FONTE,
  fontStyle: "italic",
  textTransform: "uppercase",
  lineHeight: 1,
  whiteSpace: "nowrap",
  color: "var(--cor-apoio)",
};

export const BLOCO_ESQUERDA: CSSProperties = {...BLOCO, alignItems: "flex-start", textAlign: "left"};

// .ln — uma linha: as partes lado a lado, 7 px entre elas.
const LINHA: CSSProperties = {display: "flex", alignItems: "center", gap: px(7), whiteSpace: "nowrap"};

const BASE: CSSProperties = {fontFamily: FONTE, fontStyle: "italic", textTransform: "uppercase", lineHeight: 1, display: "inline-block"};

// Papéis: .caixa, .cor (.brilho no gigante), .branco, .leve e .mini.
const ESTILOS: Record<Papel, CSSProperties> = {
  etiqueta: {
    ...BASE,
    fontWeight: 800,
    background: "var(--caixa-fundo)",
    color: "var(--caixa-texto)",
    // padding 2px 7px 3px e cantos de 2 px, na letra de 19 px
    padding: ".105em .368em .158em",
    borderRadius: ".105em",
    textShadow: "none",
  },
  destaque: {...BASE, fontWeight: 900, color: "var(--destaque)", textShadow: SOMBRA_COR},
  gigante: {...BASE, fontWeight: 900, color: "var(--destaque)", letterSpacing: "-.02em", textShadow: BRILHO},
  corpo: {...BASE, fontWeight: 800, color: "var(--cor-apoio)", textShadow: SOMBRA_TEXTO},
  leve: {...BASE, fontWeight: 400, fontStyle: "normal", color: "var(--cor-apoio)", textShadow: SOMBRA_TEXTO},
  mini: {
    ...BASE,
    display: "inline-flex",
    flexDirection: "column",
    fontWeight: 800,
    lineHeight: 1.05,
    textAlign: "left",
    color: "var(--cor-apoio)",
    textShadow: SOMBRA_TEXTO,
  },
};

// Tamanhos da prancha: etiqueta 19 · corpo 24 · destaque 30 · gigante 42 · miudinho 9.
// O fecho leve do destaque gigante usa 30.
const TAMANHOS: Record<Papel, number> = {
  etiqueta: 19 * PX,
  corpo: 24 * PX,
  destaque: 30 * PX,
  gigante: 42 * PX,
  leve: 30 * PX,
  mini: 9 * PX,
};

export const papeis = (arranjo: ConfigDosPapeis["arranjo"], tamanhos: Partial<Record<Papel, number>> = {}): ConfigDosPapeis => ({
  arranjo,
  estilos: ESTILOS,
  tamanhosCqw: {...TAMANHOS, ...Object.fromEntries(Object.entries(tamanhos).map(([papel, valor]) => [papel, valor * PX]))},
  linha: LINHA,
  // Entrada da linha: sobe 22 px, desfoque de 6 px a 0.
  sobeCqw: 22 * PX,
  desfoqueCqw: 6 * PX,
  // A linha encolhe por inteiro se passar desta largura.
  larguraMaximaCqw: 88,
});

// Entrada da linha: 7 quadros, escala de 0,90 a 1, curva back-out (o deslocamento
// e o desfoque são postos pelo motor, conforme o tamanho da linha).
export const ENTRADA_DA_LINHA: EntranceAnimation = {
  durationMs: 7 * QUADRO_MS,
  easing: [0.34, 1.56, 0.64, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0,
  fromScale: 0.9,
};

// Etiqueta sozinha na linha: a caixa abre da esquerda para a direita em 6 quadros.
export const ABRE_A_ETIQUETA: EntranceAnimation = {
  durationMs: 6 * QUADRO_MS,
  easing: [0.33, 1, 0.68, 1],
  fromOpacity: 1,
  fromTranslateYEm: 0,
  fromBlurEm: 0,
  fromScale: 1,
  fromClipRight: 1,
};

// Linear: cada palavra (ou letra) sobe 14 px em 5 quadros, curva cúbica-out.
export const ENTRADA_LINEAR: EntranceAnimation = {
  durationMs: 5 * QUADRO_MS,
  easing: [0.33, 1, 0.68, 1],
  fromOpacity: 0,
  fromTranslateYEm: 14 / 24,
  fromBlurEm: 0,
  fromScale: 1,
};

// Saída do bloco: 5 quadros, sobe 10 px, escala 0,96, some.
export const SAIDA: NonNullable<CaptionTemplate["saida"]> = {duracaoMs: 5 * QUADRO_MS, sobeCqw: 10 * PX, escala: 0.96};
// O linear sobe 8 px e não encolhe.
export const SAIDA_LINEAR: NonNullable<CaptionTemplate["saida"]> = {duracaoMs: 5 * QUADRO_MS, sobeCqw: 8 * PX, escala: 1};

// Por letra: 1 quadro de atraso entre as letras.
export const POR_LETRA = {atrasoPorLetraMs: QUADRO_MS};

// Lugares da prancha (centro do bloco em %): embaixo e centralizado, ou em cima à
// esquerda (a borda esquerda a 26 px).
export const EMBAIXO: NonNullable<CaptionTemplate["posicao"]> = {x: 50, y: 73};
export const EM_CIMA_ESQUERDA: NonNullable<CaptionTemplate["posicao"]> = {x: 26 * PX, y: 20.5, ancora: "esquerda"};

// Um layout dinâmico do pacote C.
export const dinamico = (
  arranjo: ConfigDosPapeis["arranjo"],
  lugar: NonNullable<CaptionTemplate["posicao"]>,
  tamanhos: Partial<Record<Papel, number>> = {},
): CaptionTemplate => ({
  family: "destaque",
  structure: "papeis",
  keywordEffect: "brilho",
  styles: {block: lugar.ancora === "esquerda" ? BLOCO_ESQUERDA : BLOCO},
  papeis: papeis(arranjo, tamanhos),
  animations: {word: ENTRADA_DA_LINHA, keyword: ENTRADA_DA_LINHA, top: ABRE_A_ETIQUETA},
  posicao: lugar,
  saida: SAIDA,
});
