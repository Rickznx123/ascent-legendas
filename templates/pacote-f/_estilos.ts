import type {CSSProperties} from "react";
import type {CaptionTemplate, ConfigDosPapeis, EntranceAnimation, Papel} from "../../src/types";

/*
 * ESTILOS COMPARTILHADOS DO PACOTE F (editorial) — os valores de referencia.html.
 * Arquivos que começam com "_" não viram template; só guardam peças comuns.
 *
 * A prancha usa um vídeo de 360 x 640 px; aqui tudo está em cqw (% da largura do
 * vídeo), na mesma proporção: 1 px da prancha = 1/3,6 cqw (em 1080 px, 3 px).
 * Movimento a 30 quadros por segundo: 1 quadro = 33,3 ms.
 *
 * Cores: a sans é sempre branca. A paleta (pasta paletas/) pinta só a serifa e o elo
 * e dá o brilho deles:
 *   var(--destaque)  serifa e elo (com degradê, o motor recorta no texto)
 *   var(--brilho-1)  brilho da serifa (glow.inner da paleta, com a intensidade)
 */

const PX = 100 / 360;
const px = (valor: number) => `${(valor * PX).toFixed(3)}cqw`;
const QUADRO_MS = 1000 / 30;

export const SANS = "'Inter Tight', Helvetica, Arial, sans-serif";
export const SERIFA = "'Instrument Serif', Georgia, serif";
const BRANCO = "#FFFFFF";

// Sombra suave da sans, para ler em fundo claro: 0 1px 2px e 0 4px 18px.
export const SOMBRA_SANS = `0 ${px(1)} ${px(2)} rgba(0,0,0,.35), 0 ${px(4)} ${px(18)} rgba(0,0,0,.28)`;
// Brilho da serifa (14 px, cresce com --acende no fim da entrada) e a sombra leve.
// Em fundo claro (conferido no vídeo de teste, serifa creme sobre camisa branca),
// só o brilho não separa a cor clara do fundo: a serifa e o elo ganham também a
// sombra suave da sans por baixo.
const SOMBRA_SERIFA = `0 ${px(2)} ${px(10)} rgba(0,0,0,.25), ${SOMBRA_SANS}`;
const BRILHO_SERIFA = `0 0 calc(var(--acende, 1) * ${px(14)}) var(--brilho-1), ${SOMBRA_SERIFA}`;

// .bloco — linhas empilhadas e centralizadas, line-height .92.
export const BLOCO: CSSProperties = {
  width: "max-content",
  maxWidth: "90cqw",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  lineHeight: 0.92,
  whiteSpace: "nowrap",
  color: BRANCO,
};

// .ln — uma linha: as palavras lado a lado, na mesma linha de base.
const LINHA: CSSProperties = {display: "flex", alignItems: "baseline", justifyContent: "center", whiteSpace: "nowrap"};

// .sans — Inter Tight 700 com espaçamento negativo.
export const ESTILO_SANS: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 700,
  fontStyle: "normal",
  letterSpacing: "-.055em",
  color: BRANCO,
  textShadow: SOMBRA_SANS,
};

// .serif — Instrument Serif itálica, na cor da paleta, com brilho.
const ESTILO_SERIFA: CSSProperties = {
  fontFamily: SERIFA,
  fontStyle: "italic",
  fontWeight: 400,
  letterSpacing: "-.01em",
  color: "var(--destaque)",
  textShadow: BRILHO_SERIFA,
  padding: "0 .04em",
};

// .elo — a serifa miúda (metade do destaque). A prancha usa margem de .12em dos dois
// lados; no vídeo, a itálica do elo encostava nos destaques, então .3em.
const ESTILO_ELO: CSSProperties = {
  fontFamily: SERIFA,
  fontStyle: "italic",
  fontWeight: 400,
  color: "var(--destaque)",
  opacity: 0.9,
  margin: "0 .3em",
  textShadow: SOMBRA_SERIFA,
};

const ESTILOS: Partial<Record<Papel, CSSProperties>> = {
  sans: ESTILO_SANS,
  "sans-pequena": ESTILO_SANS,
  "sans-grande": ESTILO_SANS,
  serifa: ESTILO_SERIFA,
  "serifa-gigante": ESTILO_SERIFA,
  elo: ESTILO_ELO,
};

// Tamanhos da prancha: sans 28 (pequena 22, grande 40) · serifa 40 · gigante 56 · elo 20.
const TAMANHOS_PX: Partial<Record<Papel, number>> = {
  sans: 28,
  "sans-pequena": 22,
  "sans-grande": 40,
  serifa: 40,
  "serifa-gigante": 56,
  elo: 20,
};

// Sans: cada palavra sobe 10 px, com desfoque de 4 px a 0, em 6 quadros, curva
// cúbica-out. Em em da própria palavra (depende do tamanho).
export const sobe = (tamanhoPx: number): EntranceAnimation => ({
  durationMs: 6 * QUADRO_MS,
  easing: [0.33, 1, 0.68, 1],
  fromOpacity: 0,
  fromTranslateYEm: 10 / tamanhoPx,
  fromBlurEm: 4 / tamanhoPx,
  fromScale: 1,
});

// Serifa: revelada da esquerda para a direita em 9 quadros, escala de 1,06 a 1, e o
// brilho acende nos últimos 4 quadros. A folga do recorte deixa o brilho e a
// inclinação do itálico aparecerem em volta (à direita, no fim da revelação).
export const REVELA: EntranceAnimation = {
  durationMs: 9 * QUADRO_MS,
  easing: [0.33, 1, 0.68, 1],
  fromOpacity: 0,
  fromTranslateYEm: 0,
  fromBlurEm: 0,
  fromScale: 1.06,
  fromClipRight: 1,
  folgaDoRecorte: {verticalPct: 30, esquerdaPct: 10, direitaPct: 10},
  brilhoAcende: [5 / 9, 1],
};

const ANIMACOES: Partial<Record<Papel, EntranceAnimation>> = {
  sans: sobe(28),
  "sans-pequena": sobe(22),
  "sans-grande": sobe(40),
  elo: sobe(20),
  serifa: REVELA,
  "serifa-gigante": REVELA,
};

// Saída do bloco: 6 quadros, desfoque até 4 px e some, sem deslocar.
export const SAIDA: NonNullable<CaptionTemplate["saida"]> = {duracaoMs: 6 * QUADRO_MS, sobeCqw: 0, escala: 1, desfoqueCqw: 4 * PX};

// Lugar da prancha: o bloco começa a 418 px de 640; o centro fica perto de 71%.
export const LUGAR: NonNullable<CaptionTemplate["posicao"]> = {x: 50, y: 71};

const papeis = (arranjo: ConfigDosPapeis["arranjo"]): ConfigDosPapeis => ({
  arranjo,
  estilos: ESTILOS,
  tamanhosCqw: Object.fromEntries(Object.entries(TAMANHOS_PX).map(([papel, valor]) => [papel, valor * PX])),
  linha: LINHA,
  // Só o modo de linha inteira usa estes dois; no F cada papel tem a sua entrada.
  sobeCqw: 10 * PX,
  desfoqueCqw: 4 * PX,
  larguraMaximaCqw: 88,
  // .sans + .sans: .2em; sans e serifa (e serifa com serifa): .16em.
  porPalavra: {animacoes: ANIMACOES, padraoEm: 0.16, mesmoPapelEm: {sans: 0.2, "sans-pequena": 0.2, "sans-grande": 0.2}},
});

// Um layout dinâmico do pacote F.
export const dinamico = (arranjo: ConfigDosPapeis["arranjo"]): CaptionTemplate => ({
  family: "destaque",
  structure: "papeis",
  keywordEffect: "brilho",
  styles: {block: BLOCO},
  papeis: papeis(arranjo),
  animations: {word: sobe(28), keyword: REVELA},
  posicao: LUGAR,
  saida: SAIDA,
});
