// Pacote C, estilo "imobiliário" (templates/pacote-c/referencia.html).
//
// Cena (layouts de papel "cena"): um destaque do C abre a cena. A ÂNCORA é o começo
// da frase (mais de uma palavra, ou uma com 10 letras ou mais): cada palavra cai no
// instante da fala e fica parada; o apoio fica numa linha fina acima da chave. O
// TRILHO é a linha junto da âncora: as palavras seguintes passam por ele uma por
// vez (a nova entra de um lado no instante da fala, a anterior sai pelo outro, com
// motion blur horizontal); apoio curto passa junto com a palavra seguinte. A âncora
// fica até passarem 5 palavras no trilho e sai na pausa ou no fim de frase seguinte
// (no máximo 8); se a frase acaba antes, sai no fim dela. Âncora e trilho sobem
// juntos, e uma âncora nova começa. A cena corre pelas palavras dos blocos seguidos:
// os lineares do rodízio que vêm depois do destaque alimentam o trilho; um destaque
// novo não corta a cena: a próxima âncora é que usa a variação dele.
//
// Fora das cenas (papel "unico" e "linear"): o bloco sozinho, num grupo central.
//
// Tudo é calculado por quadro (posição, velocidade, blur), a partir dos parâmetros
// da prancha na base de 360 x 640, convertidos para a largura da composição.
import type {CSSProperties, ReactNode} from "react";
import {useCurrentFrame, useVideoConfig} from "remotion";
import {measureText} from "@remotion/layout-utils";
import {AGRUPAMENTO_CONFIG} from "./agrupamento-config";
import {endsSentence, findKeywordIndex, normalizeForKeyword} from "./captions";
import {entradaAjustada} from "./entrada";
import {ENTRADA_IMOBILIARIO, IMOBILIARIO} from "./imobiliario-config";
import type {BlockTiming} from "./tempos";
import type {AssignedCaptionBlock, CaptionTemplate, ConfigImobiliario, Word} from "./types";

export {ENTRADA_IMOBILIARIO, IMOBILIARIO};

// ---------- palavras ----------

// Apoio: artigos, preposições (e contrações), conjunções e verbos de ligação.
const APOIO = new Set(
  [
    // artigos
    "o", "a", "os", "as", "um", "uma", "uns", "umas",
    // preposições e contrações
    "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "num", "numa",
    "por", "pelo", "pela", "pelos", "pelas", "para", "pra", "pro", "pras", "pros",
    "com", "sem", "sob", "sobre", "entre", "ate", "desde", "ao", "aos",
    "ante", "apos", "contra", "perante", "dum", "duma", "neste", "nesta", "naquele", "naquela",
    // conjunções
    "e", "ou", "mas", "nem", "que", "se", "porque", "pois", "como", "quando", "porem",
    "entao", "logo", "tambem",
    // verbos de ligação
    "sao", "era", "eram", "foi", "foram", "sera", "serao", "seja", "sejam", "ser", "sendo", "sou", "somos",
    "esta", "estao", "estava", "estavam", "esteve", "estar", "estou", "estamos",
    "fica", "ficam", "ficou", "ficar", "parece", "parecem", "continua", "continuam",
    "permanece", "anda", "vira", "viram", "virou", "torna", "tornou",
  ],
);

export const ehApoio = (texto: string): boolean => APOIO.has(normalizeForKeyword(texto));
// Números e medidas (535m², 20, 3x) sempre recebem a cor.
const ehNumero = (texto: string): boolean => /\d/u.test(texto);
const limpa = (texto: string): string => texto.replace(/[,.:;]+(?=[!?]*$)/gu, "");
const letras = (texto: string): number => normalizeForKeyword(texto).length;

// Uma palavra na tela: de que bloco veio, se é chave e se recebe a cor.
type Palavra = {word: Word; bloco: number; indice: number; chave: boolean; cor: boolean; chaveDoBloco: boolean};

const palavrasDoBloco = (block: AssignedCaptionBlock, bloco: number): Palavra[] => {
  const chaveDoBloco = findKeywordIndex(block.words, block.keyword);
  return block.words.map((word, indice) => ({word, bloco, indice, chave: !ehApoio(word.text), cor: false, chaveDoBloco: indice === chaveDoBloco}));
};

// Cor num conjunto de palavras: números e medidas sempre; sem eles, a chave do
// bloco (se estiver no conjunto) ou a chave mais longa.
const marcarCor = (palavras: Palavra[]) => {
  const numeros = palavras.filter((p) => ehNumero(p.word.text));
  if (numeros.length > 0) {
    for (const p of numeros) p.cor = true;
    return;
  }
  const chaves = palavras.filter((p) => p.chave);
  const escolhida = chaves.find((p) => p.chaveDoBloco) ?? [...chaves].sort((x, y) => letras(y.word.text) - letras(x.word.text))[0];
  if (escolhida) escolhida.cor = true;
};

// ---------- cenas ----------

// Um trecho do trilho: uma palavra, com o apoio curto que vem antes dela.
type Trecho = Palavra[];

export type Cena = {
  id: string;
  // Bloco que abriu a cena (variação, paleta e posição).
  bloco: number;
  config: ConfigImobiliario;
  ancora: Palavra[];
  trilho: Trecho[];
  // A âncora começa a entrar e quando a cena começa a sair.
  inicioMs: number;
  saidaMs: number;
};

const configDe = (template: CaptionTemplate | undefined): ConfigImobiliario | undefined =>
  template?.structure === "imobiliario" ? (template.imobiliario ?? {papel: "cena"}) : undefined;

// Quanto a cena fica na tela depois da última palavra, se a fala não continua.
const SEGURA_DEPOIS_MS = 1500;

// Âncora: mais de uma palavra (terminando numa chave), ou uma com 10 letras ou mais;
// com chavesNaAncora 2, duas chaves. Fim de frase fecha a âncora antes.
const tamanhoDaAncora = (palavras: Palavra[], chaves: number): number => {
  let chavesVistas = 0;
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i];
    if (p.chave) chavesVistas++;
    if (endsSentence(p.word.text)) return i + 1;
    const longa = i === 0 && letras(p.word.text) >= IMOBILIARIO.ancora.letrasDaPalavraLonga;
    if (p.chave && chavesVistas >= chaves && (i >= 1 || longa)) return i + 1;
  }
  return palavras.length;
};

// Trechos do trilho a partir de palavras[inicio]: devolve os trechos e onde a cena
// acaba (índice da primeira palavra que fica para a próxima).
const trilhoAte = (palavras: Palavra[], inicio: number): {trilho: Trecho[]; fim: number} => {
  const {palavrasMinimas, palavrasMaximas, apoioCurto} = IMOBILIARIO.trilho;
  const trilho: Trecho[] = [];
  let quantas = 0;
  let i = inicio;
  while (i < palavras.length) {
    const trecho: Trecho = [];
    let j = i;
    // Apoio curto (artigo, preposição) passa junto com a palavra seguinte.
    while (j < palavras.length - 1 && !palavras[j].chave && letras(palavras[j].word.text) <= apoioCurto && !endsSentence(palavras[j].word.text)) {
      trecho.push(palavras[j++]);
    }
    trecho.push(palavras[j++]);
    // Nunca mais que palavrasMaximas no trilho: o trecho que passaria fica para a
    // próxima âncora.
    if (quantas > 0 && quantas + trecho.length > palavrasMaximas) {
      break;
    }
    i = j;
    trilho.push(trecho);
    quantas += trecho.length;
    const ultima = trecho[trecho.length - 1].word;
    const seguinte = palavras[i]?.word;
    const pausa = seguinte !== undefined && seguinte.startMs - ultima.endMs >= AGRUPAMENTO_CONFIG.pausaMinimaMs;
    if (endsSentence(ultima.text) || quantas >= palavrasMaximas || (quantas >= palavrasMinimas && pausa)) {
      break;
    }
  }
  return {trilho, fim: i};
};

// Cenas de todo o vídeo. blocosEmCena: os blocos desenhados pelas cenas (o render
// não os desenha de novo como bloco).
export const montarCenas = (
  blocks: AssignedCaptionBlock[],
  templates: Record<string, CaptionTemplate>,
  timeline: BlockTiming[],
): {cenas: Cena[]; blocosEmCena: Set<number>} => {
  const cenas: Cena[] = [];
  const blocosEmCena = new Set<number>();
  let b = 0;
  while (b < blocks.length) {
    const config = configDe(templates[blocks[b].template]);
    if (config?.papel !== "cena") {
      b++;
      continue;
    }
    // A sequência: o destaque e os blocos que alimentam o trilho (lineares do
    // rodízio e outros destaques de cena do C).
    const sequencia: number[] = [b];
    let c = b + 1;
    while (c < blocks.length) {
      const seguinte = configDe(templates[blocks[c].template]);
      if (seguinte?.papel === "cena" || (seguinte?.papel === "linear" && !blocks[c].layoutManual)) {
        sequencia.push(c++);
      } else {
        break;
      }
    }
    // Palavras da sequência, com a entrada do bloco (como withEntry no render) e onde
    // cada destaque começa.
    const palavras: Palavra[] = [];
    const destaqueEm = new Map<number, number>();
    for (const indice of sequencia) {
      const block = blocks[indice];
      const showMs = timeline[indice]?.showMs ?? block.startMs;
      if (configDe(templates[block.template])?.papel === "cena") destaqueEm.set(palavras.length, indice);
      for (const p of palavrasDoBloco(block, indice)) {
        palavras.push({...p, word: {...p.word, startMs: Math.max(p.word.startMs, showMs)}});
      }
      blocosEmCena.add(indice);
    }
    // As cenas seguem só as regras da âncora (5 a 8 palavras, pausa, fim de frase);
    // cada cena usa a variação do último destaque que começou até a primeira palavra dela.
    const inicios = [...destaqueEm.keys()].sort((x, y) => x - y);
    let blocoDaVariacao = b;
    let i = 0;
    while (i < palavras.length) {
      for (const inicio of inicios) if (inicio <= i) blocoDaVariacao = destaqueEm.get(inicio)!;
      const doTrecho = palavras.slice(i);
      const configDaCena = configDe(templates[blocks[blocoDaVariacao].template]) ?? config;
      const nAncora = tamanhoDaAncora(doTrecho, configDaCena.chavesNaAncora ?? 1);
      const ancora = doTrecho.slice(0, nAncora);
      const fechouNaAncora = endsSentence(ancora[ancora.length - 1].word.text);
      const {trilho, fim} = fechouNaAncora ? {trilho: [], fim: nAncora} : trilhoAte(doTrecho, nAncora);
      if (!ancora.some((p) => p.chave)) ancora[ancora.length - 1].chave = true;
      marcarCor(ancora);
      for (const trecho of trilho) {
        for (const p of trecho) p.cor = p.chave && (ehNumero(p.word.text) || p.chaveDoBloco || letras(p.word.text) >= IMOBILIARIO.ancora.letrasDaPalavraLonga);
      }
      const usadas = [...ancora, ...trilho.flat()];
      cenas.push({
        id: `${Math.round(ancora[0].word.startMs)}-${ancora[0].bloco}-${ancora[0].indice}`,
        bloco: blocoDaVariacao,
        config: configDaCena,
        ancora,
        trilho,
        inicioMs: ancora[0].word.startMs,
        // Definida abaixo, quando se sabe o que vem depois.
        saidaMs: usadas[usadas.length - 1].word.endMs,
      });
      i += fim;
    }
    // Saída: quando a próxima cena começa (a fala continua), sem passar de
    // SEGURA_DEPOIS_MS depois da última palavra; a última sai no fim da sequência.
    const daSequencia = cenas.filter((cena) => sequencia.includes(cena.bloco));
    const fimDaSequencia = timeline[sequencia[sequencia.length - 1]]?.hideMs;
    daSequencia.forEach((cena, k) => {
      const ultimaPalavraMs = cena.saidaMs;
      const proxima = daSequencia[k + 1];
      cena.saidaMs = proxima
        ? Math.min(proxima.inicioMs, ultimaPalavraMs + SEGURA_DEPOIS_MS)
        : Math.max(ultimaPalavraMs, fimDaSequencia ?? ultimaPalavraMs + SEGURA_DEPOIS_MS);
    });
    b = c;
  }
  return {cenas, blocosEmCena};
};

// Quantos quadros a saída leva (a última palavra começa a sair mais tarde).
export const quadrosDaSaida = (palavras: number): number =>
  IMOBILIARIO.saida.quadros + Math.max(0, palavras - 1) * IMOBILIARIO.saida.cascata;
export const palavrasDaCena = (cena: Cena): number => cena.ancora.length + (cena.trilho.at(-1)?.length ?? 0);

// ---------- tamanho das letras ----------
const FONTE = "Inter Tight";
const larguraDoTexto = (texto: string, tamanho: number, peso: number, espacamento?: string): number =>
  measureText({text: texto, fontFamily: FONTE, fontSize: tamanho, fontWeight: peso, letterSpacing: espacamento, validateFontIsLoaded: false}).width;

// Tamanho de cada palavra da linha (em px da base 360): a chave segue 440/nº de
// letras (de 44 ao teto); se a linha não couber, as chaves encolhem até caber.
const tamanhosDaLinha = (linha: Palavra[], larguraDisponivel: number, teto: number = IMOBILIARIO.chave.maximo): number[] => {
  const {apoio, chave} = IMOBILIARIO;
  const tamanhos = linha.map((p) =>
    p.chave ? Math.max(Math.min(chave.minimo, teto), Math.min(teto, chave.numerador / Math.max(1, limpa(p.word.text).length))) : apoio.tamanho,
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
  const larguraDasChaves = largura - medir(0);
  const fixa = largura - larguraDasChaves;
  const escala = Math.max(0.3, (larguraDisponivel - fixa) / Math.max(1, larguraDasChaves));
  return tamanhos.map((t, i) => (linha[i].chave ? t * escala : t));
};

const LARGURA_UTIL = IMOBILIARIO.base.largura - IMOBILIARIO.grupo.esquerda - IMOBILIARIO.grupo.direita;

// ---------- movimento ----------
const expoOut = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const cubIn = (p: number) => p * p * p;
const lim = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Estado = {x: number; y: number; opacidade: number};
type Entrada = {inicio: number; duracao: number};

// Entrada de uma palavra (ou trecho) no instante da fala, acelerada com a Sincronia
// precisa se o bloco entrou tarde (corte seco na colisão; veja entradaAjustada).
const entradaDe = (word: Word, fps: number): Entrada => {
  const ajustada = entradaAjustada(ENTRADA_IMOBILIARIO, word.startMs, word.faladaMs, 1000 / fps);
  return {inicio: Math.round((word.startMs / 1000) * fps), duracao: Math.max(0, (ajustada.durationMs / 1000) * fps)};
};

// Progresso da entrada: quanto falta do caminho (0 a 1) e a opacidade.
const progressoDaEntrada = (quadro: number, entrada: Entrada): {falta: number; opacidade: number} | undefined => {
  const q = quadro - entrada.inicio;
  if (q < 0) return undefined;
  if (entrada.duracao <= 0) return {falta: 0, opacidade: 1};
  const escala = entrada.duracao / IMOBILIARIO.entrada.quadros;
  return {
    falta: 1 - expoOut(lim(q / entrada.duracao, 0, 1)),
    opacidade: lim(q / (IMOBILIARIO.quadrosDaOpacidade * escala), 0, 1),
  };
};

// Saída para cima, em cascata (ordem: a posição da palavra na saída).
const subir = (estado: Estado, quadro: number, saida: number | undefined, ordem: number): Estado | undefined => {
  if (saida === undefined) return estado;
  const q = quadro - saida - ordem * IMOBILIARIO.saida.cascata;
  if (q <= 0) return estado;
  const s = lim(q / IMOBILIARIO.saida.quadros, 0, 1);
  if (s >= 1) return undefined;
  return {...estado, y: estado.y - cubIn(s) * IMOBILIARIO.saida.sobe, opacidade: estado.opacidade * (1 - s * s)};
};

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

const estiloDaPalavra = (p: Palavra, tamanho: number, px: number): CSSProperties => ({
  display: "inline-block",
  lineHeight: 0.9,
  fontFamily: FONTE,
  fontSize: tamanho * px,
  fontWeight: p.chave ? IMOBILIARIO.chave.peso : IMOBILIARIO.apoio.peso,
  letterSpacing: p.chave ? IMOBILIARIO.chave.espacamento : "-0.01em",
  color: "var(--cor-apoio)",
  whiteSpace: "nowrap",
  textShadow: p.chave
    ? `0 ${3 * px}px ${14 * px}px color-mix(in srgb, var(--cor-sombra) 30%, transparent)`
    : `0 ${2 * px}px ${10 * px}px color-mix(in srgb, var(--cor-sombra) 35%, transparent)`,
  ...(p.cor ? PREENCHIMENTO_COM_COR : {}),
});

// Aplica o movimento de um quadro a um elemento: posição, esticada no eixo e motion
// blur num eixo só, proporcional à velocidade (filtro SVG recalculado por quadro).
const emMovimento = (
  id: string,
  agora: Estado | undefined,
  antes: Estado | undefined,
  px: number,
  filtros: ReactNode[],
): CSSProperties => {
  if (!agora) return {opacity: 0};
  const anterior = antes ?? agora;
  const vx = Math.abs(agora.x - anterior.x);
  const vy = Math.abs(agora.y - anterior.y);
  const ex = 1 + Math.min(vx / IMOBILIARIO.esticada.divisor, IMOBILIARIO.esticada.teto);
  const ey = 1 + Math.min(vy / IMOBILIARIO.esticada.divisor, IMOBILIARIO.esticada.teto);
  const estilo: CSSProperties = {
    opacity: agora.opacidade,
    transform: `translate(${(agora.x * px).toFixed(2)}px, ${(agora.y * px).toFixed(2)}px) scale(${ex.toFixed(3)}, ${ey.toFixed(3)})`,
  };
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
  return estilo;
};

const Filtros: React.FC<{filtros: ReactNode[]}> = ({filtros}) => (
  <svg width={0} height={0} style={{position: "absolute"}} aria-hidden="true">
    <defs>{filtros}</defs>
  </svg>
);

const topoDoConjunto = (altura: ConfigImobiliario["altura"]) => (altura === "cabeca" ? IMOBILIARIO.grupo.cima : IMOBILIARIO.grupo.baixo);

// Linhas da âncora: o apoio numa linha fina acima da chave ("se" / "você").
const linhasDaAncora = (ancora: Palavra[]): Palavra[][] => {
  const linhas: Palavra[][] = [];
  let apoio: Palavra[] = [];
  for (const p of ancora) {
    if (p.chave) {
      if (apoio.length > 0) linhas.push(apoio);
      linhas.push([p]);
      apoio = [];
    } else {
      apoio.push(p);
    }
  }
  if (apoio.length > 0) linhas.push(apoio);
  return linhas;
};

// Uma cena (âncora + trilho). deslocamento: quanto o usuário arrastou (em %).
// miniatura: a da galeria, recortada em volta da altura do tronco; as variações
// acima da cabeça ficam no tronco para aparecer no recorte.
export const CenaImobiliaria: React.FC<{cena: Cena; deslocamento: {x: number; y: number}; miniatura?: boolean}> = ({cena, deslocamento, miniatura}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const px = width / IMOBILIARIO.base.largura;
  const pxAltura = height / IMOBILIARIO.base.altura;
  const {config} = cena;
  const saida = Math.round((cena.saidaMs / 1000) * fps);
  const lado = config.trilhoEntra === "direita" ? 1 : -1;
  const filtros: ReactNode[] = [];
  let ordem = 0;

  // Âncora: cada palavra cai (ou sobe, se a âncora fica embaixo) no instante da fala.
  const deCima = config.ordem !== "trilho-ancora";
  const ancora = linhasDaAncora(cena.ancora).map((linha, indiceDaLinha) => {
    const recuo = indiceDaLinha > 0 && linha.some((p) => p.chave) && indiceDaLinha % 2 === 0 ? IMOBILIARIO.grupo.recuo : 0;
    const tamanhos = tamanhosDaLinha(linha, LARGURA_UTIL - recuo);
    return (
      <div
        key={indiceDaLinha}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: IMOBILIARIO.linha.espaco * px,
          marginLeft: recuo * px,
          marginTop: indiceDaLinha > 0 ? -IMOBILIARIO.linha.sobreposicao * px * 0.5 : 0,
        }}
      >
        {linha.map((p, i) => {
          const minhaOrdem = ordem++;
          const entrada = entradaDe(p.word, fps);
          const estado = (q: number) => {
            const e = progressoDaEntrada(q, entrada);
            if (!e) return undefined;
            const y = (deCima ? -1 : 1) * e.falta * IMOBILIARIO.entrada.distancia;
            return subir({x: 0, y, opacidade: e.opacidade}, q, saida, minhaOrdem);
          };
          const id = `ma-${cena.id}-${p.bloco}-${p.indice}`;
          return (
            <span key={p.indice} style={{...estiloDaPalavra(p, tamanhos[i], px), ...emMovimento(id, estado(frame), estado(frame - 1), px, filtros)}}>
              {limpa(p.word.text)}
            </span>
          );
        })}
      </div>
    );
  });

  // Trilho: um trecho por vez; o novo entra de um lado no instante da fala e o
  // anterior sai pelo outro. O último sai para cima com a âncora.
  const entradas = cena.trilho.map((trecho) => entradaDe(trecho[0].word, fps));
  const ordemDoTrilho = ordem;
  const alturaDoTrilho = IMOBILIARIO.chave.maximo * 0.9;
  const trilho = cena.trilho.map((trecho, k) => {
    const entrada = entradas[k];
    const proxima = entradas[k + 1];
    const estado = (q: number): Estado | undefined => {
      const e = progressoDaEntrada(q, entrada);
      if (!e) return undefined;
      let x = lado * e.falta * IMOBILIARIO.trilho.distancia;
      let opacidade = e.opacidade;
      if (proxima && q > proxima.inicio) {
        // Sai pelo outro lado quando o trecho seguinte entra.
        const s = lim((q - proxima.inicio) / IMOBILIARIO.saida.quadros, 0, 1);
        if (s >= 1) return undefined;
        x -= lado * cubIn(s) * IMOBILIARIO.trilho.saida;
        opacidade *= 1 - s * s;
      }
      return subir({x, y: 0, opacidade}, q, proxima ? undefined : saida, ordemDoTrilho);
    };
    const agora = estado(frame);
    if (!agora) return null;
    const tamanhos = tamanhosDaLinha(trecho, LARGURA_UTIL);
    const id = `mt-${cena.id}-${k}`;
    return (
      <div
        key={k}
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          display: "flex",
          alignItems: "baseline",
          gap: IMOBILIARIO.linha.espaco * px,
          ...emMovimento(id, agora, estado(frame - 1), px, filtros),
        }}
      >
        {trecho.map((p, i) => (
          <span key={`${p.bloco}-${p.indice}`} style={estiloDaPalavra(p, tamanhos[i], px)}>
            {limpa(p.word.text)}
          </span>
        ))}
      </div>
    );
  });
  const linhaDoTrilho =
    cena.trilho.length > 0 ? (
      <div key="trilho" style={{position: "relative", height: alturaDoTrilho * px}}>
        {trilho}
      </div>
    ) : null;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: `${(IMOBILIARIO.grupo.esquerda / IMOBILIARIO.base.largura) * 100 + deslocamento.x}%`,
          right: `${(IMOBILIARIO.grupo.direita / IMOBILIARIO.base.largura) * 100 - deslocamento.x}%`,
          top: topoDoConjunto(miniatura ? "tronco" : config.altura) * pxAltura + (deslocamento.y / 100) * height,
        }}
      >
        {deCima ? (
          <>
            {ancora}
            {linhaDoTrilho}
          </>
        ) : (
          <>
            {linhaDoTrilho}
            {ancora}
          </>
        )}
      </div>
      <Filtros filtros={filtros} />
    </>
  );
};

// ---------- bloco sozinho (único e linear) ----------

// Linhas do bloco sozinho: as palavras de apoio vão junto com a chave que vem
// depois; cada chave fecha uma linha. Apoio no fim do bloco fica na última linha.
const emLinhas = (palavras: Palavra[]): Palavra[][] => {
  const linhas: Palavra[][] = [];
  let atual: Palavra[] = [];
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

// Bloco fora das cenas, num grupo central (altura do peito). saidaMs: quando ele
// começa a sair (o fim dele na linha do tempo).
export const BlocoImobiliario: React.FC<{
  block: AssignedCaptionBlock;
  indiceDoBloco: number;
  config: ConfigImobiliario;
  saidaMs: number | undefined;
  deslocamento: {x: number; y: number};
}> = ({block, indiceDoBloco, config, saidaMs, deslocamento}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const px = width / IMOBILIARIO.base.largura;
  const pxAltura = height / IMOBILIARIO.base.altura;
  const palavras = palavrasDoBloco(block, indiceDoBloco);
  if (!palavras.some((p) => p.chave) && palavras.length > 0) palavras[palavras.length - 1].chave = true;
  const linhas = emLinhas(palavras);
  marcarCor(palavras);
  const teto = config.papel === "linear" ? IMOBILIARIO.linear.chaveMaxima : IMOBILIARIO.chave.maximo;
  const modo = config.entrada ?? (config.papel === "linear" ? "baixo" : "cima");
  const saida = saidaMs === undefined ? undefined : Math.round((saidaMs / 1000) * fps);
  const filtros: ReactNode[] = [];
  let ordem = 0;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: `${(IMOBILIARIO.grupo.esquerda / IMOBILIARIO.base.largura) * 100 + deslocamento.x}%`,
          right: `${(IMOBILIARIO.grupo.direita / IMOBILIARIO.base.largura) * 100 - deslocamento.x}%`,
          top: IMOBILIARIO.grupo.unico * pxAltura + (deslocamento.y / 100) * height,
        }}
      >
        {linhas.map((linha, indiceDaLinha) => {
          const recuo = indiceDaLinha % 2 ? IMOBILIARIO.grupo.recuo : 0;
          const tamanhos = tamanhosDaLinha(linha, LARGURA_UTIL - recuo, teto);
          return (
            <div
              key={indiceDaLinha}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: IMOBILIARIO.linha.espaco * px,
                marginLeft: recuo * px,
                marginTop: indiceDaLinha > 0 ? -IMOBILIARIO.linha.sobreposicao * px : 0,
              }}
            >
              {linha.map((p, i) => {
                const minhaOrdem = ordem++;
                const entrada = entradaDe(p.word, fps);
                const estado = (q: number) => {
                  const e = progressoDaEntrada(q, entrada);
                  if (!e) return undefined;
                  const d = e.falta * IMOBILIARIO.entrada.distancia;
                  const x = modo === "lados" ? (minhaOrdem % 2 ? 1 : -1) * d * IMOBILIARIO.entrada.lados : 0;
                  const y = modo === "cima" ? -d : modo === "baixo" ? d : 0;
                  return subir({x, y, opacidade: e.opacidade}, q, saida, minhaOrdem);
                };
                const id = `mb-${Math.round(block.startMs)}-${p.indice}`;
                return (
                  <span key={p.indice} style={{...estiloDaPalavra(p, tamanhos[i], px), ...emMovimento(id, estado(frame), estado(frame - 1), px, filtros)}}>
                    {limpa(p.word.text)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      <Filtros filtros={filtros} />
    </>
  );
};
