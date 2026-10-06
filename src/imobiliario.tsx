// Pacote C, estilo "imobiliário" (pacote-c-referencia.html): cada bloco se divide
// num grupo acima da cabeça e outro na altura do tronco; palavras de apoio finas e
// pequenas, palavras-chave enormes; entrada de cada palavra no instante da fala, com
// motion blur num eixo só; saída para cima, em cascata.
// Tudo é calculado por quadro (posição, velocidade, blur), a partir dos parâmetros
// da prancha na base de 360 x 640, convertidos para a largura da composição.
import type {CSSProperties} from "react";
import {useCurrentFrame, useVideoConfig} from "remotion";
import {measureText} from "@remotion/layout-utils";
import {findKeywordIndex, normalizeForKeyword} from "./captions";
import {entradaAjustada} from "./entrada";
import {ENTRADA_IMOBILIARIO, IMOBILIARIO} from "./imobiliario-config";
import type {AssignedCaptionBlock, Word} from "./types";

export {ENTRADA_IMOBILIARIO, IMOBILIARIO};

// Apoio: artigos, preposições (e contrações), conjunções e verbos de ligação.
const APOIO = new Set(
  [
    // artigos
    "o", "a", "os", "as", "um", "uma", "uns", "umas",
    // preposições e contrações
    "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "num", "numa",
    "por", "pelo", "pela", "pelos", "pelas", "para", "pra", "pro", "pras", "pros",
    "com", "sem", "sob", "sobre", "entre", "ate", "desde", "ao", "aos", "a", "as",
    "ante", "apos", "contra", "perante", "dum", "duma", "neste", "nesta", "naquele", "naquela",
    // conjunções
    "e", "ou", "mas", "nem", "que", "se", "porque", "pois", "como", "quando", "porem",
    "entao", "logo", "tambem",
    // verbos de ligação
    "e", "sao", "era", "eram", "foi", "foram", "sera", "serao", "seja", "sejam", "ser", "sendo", "sou", "somos",
    "esta", "estao", "estava", "estavam", "esteve", "estar", "estou", "estamos",
    "fica", "ficam", "ficou", "ficar", "parece", "parecem", "continua", "continuam",
    "permanece", "anda", "vira", "viram", "virou", "torna", "tornou",
  ],
);

export const ehApoio = (texto: string): boolean => APOIO.has(normalizeForKeyword(texto));
// Números e medidas (535m², 20, 3x) sempre recebem a cor.
const ehNumero = (texto: string): boolean => /\d/u.test(texto);
const limpa = (texto: string): string => texto.replace(/[,.:;]+(?=[!?]*$)/gu, "");

type PalavraDoBloco = {word: Word; indice: number; chave: boolean; cor: boolean};
type Grupo = {nome: "cima" | "baixo"; linhas: PalavraDoBloco[][]};

// Linhas: as palavras de apoio vão junto com a chave que vem depois; cada chave
// fecha uma linha. Apoio no fim do bloco fica na última linha.
const emLinhas = (palavras: PalavraDoBloco[]): PalavraDoBloco[][] => {
  const linhas: PalavraDoBloco[][] = [];
  let atual: PalavraDoBloco[] = [];
  for (const palavra of palavras) {
    atual.push(palavra);
    if (palavra.chave) {
      linhas.push(atual);
      atual = [];
    }
  }
  if (atual.length > 0) {
    if (linhas.length > 0) linhas[linhas.length - 1].push(...atual);
    else linhas.push(atual);
  }
  return linhas;
};

// Cor no grupo: números e medidas sempre; sem eles, a chave do bloco (se cair no
// grupo) ou a chave mais longa do grupo.
const marcarCor = (linhas: PalavraDoBloco[][], chaveDoBloco: number) => {
  const palavras = linhas.flat();
  const numeros = palavras.filter((p) => ehNumero(p.word.text));
  if (numeros.length > 0) {
    for (const p of numeros) p.cor = true;
    return;
  }
  const chaves = palavras.filter((p) => p.chave);
  const escolhida =
    chaves.find((p) => p.indice === chaveDoBloco) ??
    [...chaves].sort((x, y) => limpa(y.word.text).length - limpa(x.word.text).length)[0];
  if (escolhida) escolhida.cor = true;
};

// Grupos do bloco: até 2 palavras, um grupo só (na altura do peito); senão, as
// primeiras linhas em cima e o resto embaixo.
export const gruposDoBloco = (block: AssignedCaptionBlock): Grupo[] => {
  const chaveDoBloco = findKeywordIndex(block.words, block.keyword);
  const palavras: PalavraDoBloco[] = block.words.map((word, indice) => ({word, indice, chave: !ehApoio(word.text), cor: false}));
  // Sem nenhuma chave (só apoio): a última palavra vira chave.
  if (!palavras.some((p) => p.chave) && palavras.length > 0) {
    palavras[palavras.length - 1].chave = true;
  }
  const linhas = emLinhas(palavras);
  if (block.words.length <= IMOBILIARIO.palavrasDoGrupoUnico || linhas.length === 1) {
    marcarCor(linhas, chaveDoBloco);
    return [{nome: "baixo", linhas}];
  }
  const corte = Math.ceil(linhas.length / 2);
  const grupos: Grupo[] = [
    {nome: "cima", linhas: linhas.slice(0, corte)},
    {nome: "baixo", linhas: linhas.slice(corte)},
  ];
  for (const grupo of grupos) marcarCor(grupo.linhas, chaveDoBloco);
  return grupos;
};

// ---------- tamanho das letras ----------
const FONTE = "Inter Tight";
const larguraDoTexto = (texto: string, tamanho: number, peso: number, espacamento?: string): number =>
  measureText({
    text: texto,
    fontFamily: FONTE,
    fontSize: tamanho,
    fontWeight: peso,
    letterSpacing: espacamento,
    validateFontIsLoaded: false,
  }).width;

// Tamanho de cada palavra da linha (em px da base 360): a chave segue 440/nº de
// letras (de 44 a 86); se a linha não couber, as chaves encolhem até caber.
const tamanhosDaLinha = (linha: PalavraDoBloco[], larguraDisponivel: number): number[] => {
  const {apoio, chave, numerador} = {apoio: IMOBILIARIO.apoio, chave: IMOBILIARIO.chave, numerador: IMOBILIARIO.chave.numerador};
  const tamanhos = linha.map((p) =>
    p.chave ? Math.max(chave.minimo, Math.min(chave.maximo, numerador / Math.max(1, limpa(p.word.text).length))) : apoio.tamanho,
  );
  const medir = (escala: number) =>
    linha.reduce(
      (soma, p, i) =>
        soma +
        (p.chave
          ? larguraDoTexto(limpa(p.word.text), tamanhos[i] * escala, chave.peso, chave.espacamento)
          : larguraDoTexto(limpa(p.word.text), tamanhos[i], apoio.peso)),
      IMOBILIARIO.linha.espaco * (linha.length - 1),
    );
  const largura = medir(1);
  if (largura <= larguraDisponivel) {
    return tamanhos;
  }
  // Só as chaves encolhem: a escala que faz a linha caber.
  const larguraDasChaves = medir(1) - medir(0);
  const fixa = largura - larguraDasChaves;
  const escala = Math.max(0.3, (larguraDisponivel - fixa) / Math.max(1, larguraDasChaves));
  return tamanhos.map((t, i) => (linha[i].chave ? t * escala : t));
};

// ---------- movimento ----------
const expoOut = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const cubIn = (p: number) => p * p * p;
const lim = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Como o grupo de baixo entra neste bloco: alternando, um bloco dos lados e o
// seguinte de baixo.
export type EntradaDeBaixo = "lados" | "baixo";
export const entradaDeBaixoDoBloco = (indiceDoBloco: number): EntradaDeBaixo => (indiceDoBloco % 2 === 0 ? "lados" : "baixo");

type Estado = {x: number; y: number; opacidade: number};

// Posição (em px da base) e opacidade de uma palavra num quadro; undefined: fora da tela.
const estadoNoQuadro = (
  quadro: number,
  entrada: {inicio: number; duracao: number},
  saida: number | undefined,
  grupo: "cima" | "baixo",
  ordem: number,
  modo: EntradaDeBaixo,
): Estado | undefined => {
  const qEnt = quadro - entrada.inicio;
  if (qEnt < 0) {
    return undefined;
  }
  const escala = entrada.duracao / IMOBILIARIO.entrada.quadros;
  let opacidade = escala <= 0 ? 1 : lim(qEnt / (IMOBILIARIO.quadrosDaOpacidade * escala), 0, 1);
  const falta = (1 - expoOut(entrada.duracao <= 0 ? 1 : lim(qEnt / entrada.duracao, 0, 1))) * IMOBILIARIO.entrada.distancia;
  let x = 0;
  let y = 0;
  if (grupo === "cima") y = -falta;
  else if (modo === "baixo") y = falta;
  else x = (ordem % 2 ? 1 : -1) * falta * IMOBILIARIO.entrada.lados;

  if (saida !== undefined) {
    const qSai = quadro - saida - ordem * IMOBILIARIO.saida.cascata;
    if (qSai > 0) {
      const s = lim(qSai / IMOBILIARIO.saida.quadros, 0, 1);
      if (s >= 1) {
        return undefined;
      }
      y -= cubIn(s) * IMOBILIARIO.saida.sobe;
      opacidade *= 1 - s * s;
    }
  }
  return {x, y, opacidade};
};

// Quantos quadros a saída leva (a última palavra começa a sair mais tarde).
export const quadrosDaSaida = (palavras: number): number =>
  IMOBILIARIO.saida.quadros + Math.max(0, palavras - 1) * IMOBILIARIO.saida.cascata;

// ---------- desenho ----------
const PREENCHIMENTO_COM_COR: CSSProperties = {
  backgroundImage: "var(--chave)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
  textShadow: "none",
  // Folga para o degradê cobrir a letra inteira.
  padding: "0 .04em",
  margin: "0 -.04em",
};

// Um bloco do pacote C. saidaMs: quando o bloco começa a sair (o fim dele na linha
// do tempo). deslocamento: quanto o usuário arrastou (em % da largura e da altura).
export const BlocoImobiliario: React.FC<{
  block: AssignedCaptionBlock;
  indiceDoBloco: number;
  saidaMs: number | undefined;
  deslocamento: {x: number; y: number};
}> = ({block, indiceDoBloco, saidaMs, deslocamento}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const px = width / IMOBILIARIO.base.largura;
  const pxAltura = height / IMOBILIARIO.base.altura;
  const grupos = gruposDoBloco(block);
  const modo = entradaDeBaixoDoBloco(indiceDoBloco);
  const saida = saidaMs === undefined ? undefined : Math.round((saidaMs / 1000) * fps);
  const quadroMs = 1000 / fps;
  const larguraUtil = IMOBILIARIO.base.largura - IMOBILIARIO.grupo.esquerda - IMOBILIARIO.grupo.direita;
  let ordem = 0;
  const filtros: React.ReactNode[] = [];

  const desenharPalavra = (p: PalavraDoBloco, grupo: "cima" | "baixo", tamanho: number) => {
    const minhaOrdem = ordem++;
    // Entrada no instante da palavra (com a Sincronia precisa, acelerada se o bloco
    // entrou tarde; veja entradaAjustada).
    const ajustada = entradaAjustada(ENTRADA_IMOBILIARIO, p.word.startMs, p.word.faladaMs, quadroMs);
    const entrada = {
      inicio: Math.round((p.word.startMs / 1000) * fps),
      duracao: Math.max(0, (ajustada.durationMs / 1000) * fps),
    };
    const agora = estadoNoQuadro(frame, entrada, saida, grupo, minhaOrdem, modo);
    const id = `mb-${Math.round(block.startMs)}-${p.indice}`;
    const estilo: CSSProperties = {
      display: "inline-block",
      lineHeight: 0.9,
      fontFamily: FONTE,
      fontSize: tamanho * px,
      fontWeight: p.chave ? IMOBILIARIO.chave.peso : IMOBILIARIO.apoio.peso,
      letterSpacing: p.chave ? IMOBILIARIO.chave.espacamento : "-0.01em",
      color: "var(--cor-apoio)",
      textShadow: p.chave
        ? `0 ${3 * px}px ${14 * px}px color-mix(in srgb, var(--cor-sombra) 30%, transparent)`
        : `0 ${2 * px}px ${10 * px}px color-mix(in srgb, var(--cor-sombra) 35%, transparent)`,
      ...(p.cor ? PREENCHIMENTO_COM_COR : {}),
      opacity: 0,
    };
    if (agora) {
      const antes = estadoNoQuadro(frame - 1, entrada, saida, grupo, minhaOrdem, modo) ?? agora;
      const vx = Math.abs(agora.x - antes.x);
      const vy = Math.abs(agora.y - antes.y);
      const ex = 1 + Math.min(vx / IMOBILIARIO.esticada.divisor, IMOBILIARIO.esticada.teto);
      const ey = 1 + Math.min(vy / IMOBILIARIO.esticada.divisor, IMOBILIARIO.esticada.teto);
      estilo.opacity = agora.opacidade;
      estilo.transform = `translate(${(agora.x * px).toFixed(2)}px, ${(agora.y * px).toFixed(2)}px) scale(${ex.toFixed(3)}, ${ey.toFixed(3)})`;
      // Motion blur num eixo só, proporcional à velocidade (um desenho por quadro).
      const bx = Math.min(vx * IMOBILIARIO.blur.fator, IMOBILIARIO.blur.teto);
      const by = Math.min(vy * IMOBILIARIO.blur.fator, IMOBILIARIO.blur.teto);
      if (bx > IMOBILIARIO.blur.minimo || by > IMOBILIARIO.blur.minimo) {
        filtros.push(
          <filter key={id} id={id} x="-60%" y="-150%" width="220%" height="400%">
            <feGaussianBlur stdDeviation={`${(bx * px).toFixed(2)} ${(by * px).toFixed(2)}`} />
          </filter>,
        );
        estilo.filter = `url(#${id})`;
      }
    }
    return (
      <span key={p.indice} style={estilo}>
        {limpa(p.word.text)}
      </span>
    );
  };

  const gruposDesenhados = grupos.map((grupo) => {
    const topo =
      grupos.length === 1 ? IMOBILIARIO.grupo.unico : grupo.nome === "cima" ? IMOBILIARIO.grupo.cima : IMOBILIARIO.grupo.baixo;
    return (
      <div
        key={grupo.nome}
        style={{
          position: "absolute",
          left: `${(IMOBILIARIO.grupo.esquerda / IMOBILIARIO.base.largura) * 100 + deslocamento.x}%`,
          right: `${(IMOBILIARIO.grupo.direita / IMOBILIARIO.base.largura) * 100 - deslocamento.x}%`,
          top: topo * pxAltura + (deslocamento.y / 100) * height,
        }}
      >
        {grupo.linhas.map((linha, indiceDaLinha) => {
          const recuo = indiceDaLinha % 2 ? IMOBILIARIO.grupo.recuo : 0;
          const tamanhos = tamanhosDaLinha(linha, larguraUtil - recuo);
          return (
            <div
              key={indiceDaLinha}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: IMOBILIARIO.linha.espaco * px,
                whiteSpace: "nowrap",
                marginLeft: recuo * px,
                marginTop: indiceDaLinha > 0 ? -IMOBILIARIO.linha.sobreposicao * px : 0,
              }}
            >
              {linha.map((p, i) => desenharPalavra(p, grupo.nome, tamanhos[i]))}
            </div>
          );
        })}
      </div>
    );
  });

  return (
    <>
      {gruposDesenhados}
      <svg width={0} height={0} style={{position: "absolute"}} aria-hidden="true">
        <defs>{filtros}</defs>
      </svg>
    </>
  );
};
