import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  OffthreadVideo,
  Sequence,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {measureText} from "@remotion/layout-utils";
import {findKeywordIndex, findProtectedSpans, isBlockEndingFunctionWord} from "./captions";
import {blocosNaTela, entradaAjustada} from "./entrada";
import {MarcaDagua} from "./marca-dagua";
import {BlocoImobiliario, CenaImobiliaria, montarCenas, palavrasDaCena, quadrosDaSaida} from "./imobiliario";
import {POSICAO_PADRAO, centroDentroDaMargem, posicaoDoBloco} from "./posicao";
import type {Posicao} from "./posicao";
import {waitForFonts} from "./fontes";
import {somTocado} from "./sons";
import {computeTimeline, findActiveBlockIndex} from "./tempos";
import type {BlockTiming} from "./tempos";
import type {
  AssignedCaptionBlock,
  CaptionTemplate,
  EntranceAnimation,
  KeywordFit,
  KineticCaptionVideoProps,
  Palette,
  TemplatePart,
  Word,
} from "./types";

// Cor com transparência, sem precisar converter o formato da cor da paleta.
const withAlpha = (color: string, percent: number): string =>
  `color-mix(in srgb, ${color} ${Math.min(100, Math.max(0, percent))}%, transparent)`;

// Preenchimento da palavra-chave como imagem CSS (cor sólida vira um degradê de uma cor só).
export const keywordBackground = (palette: Palette): string => {
  const fill = palette.keywordFill;
  if (fill.type === "solida") {
    return `linear-gradient(${fill.color}, ${fill.color})`;
  }
  const stops = fill.stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ");
  return `linear-gradient(${fill.angle}deg, ${stops})`;
};

// Variáveis CSS que os layouts usam:
//   --cor-apoio, --cor-sombra, --brilho-1, --brilho-2, --chave  cores da paleta
//   --sombra e --brilho  sombra e brilho do pacote A (geometria da referência A)
const paletteVariables = (palette: Palette): Record<string, string> => {
  const shadow = palette.shadow.color;
  const intensity = palette.glow.intensity;
  const shadowParts = [`0 .5cqw 3cqw ${withAlpha(shadow, 55)}`];
  const glowParts = [
    "0 0 1.2cqw var(--brilho-1)",
    "0 0 5cqw var(--brilho-2)",
    `0 .5cqw 3cqw ${withAlpha(shadow, 45)}`,
  ];
  const asFilter = (parts: string[]) => parts.map((part) => `drop-shadow(${part})`).join(" ");
  return {
    "--cor-apoio": palette.supportColor,
    "--cor-sombra": shadow,
    "--brilho-1": withAlpha(palette.glow.inner, 100 * intensity),
    "--brilho-2": withAlpha(palette.glow.outer, 100 * intensity),
    "--chave": keywordBackground(palette),
    "--sombra": shadowParts.join(", "),
    "--brilho": glowParts.join(", "),
    // Versões em filtro, usadas quando a palavra-chave tem degradê na pintura "texto".
    "--sombra-filtro": asFilter(shadowParts),
    "--brilho-filtro": asFilter(glowParts),
  };
};

// Preenchimento recortado no texto (o .tx do pacote B).
const CLIPPED_FILL: CSSProperties = {
  backgroundImage: "var(--chave)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
};

// Preenchimento e efeito de luz da palavra-chave. Com cor sólida, usa text-shadow
// como a referência. Com degradê (background-clip: text), o text-shadow cobriria o
// degradê, então a mesma sombra vira filter: drop-shadow.
// Na pintura "recorte", o brilho fica no elemento de fora (keywordOuter do template).
const keywordPaint = (
  palette: Palette,
  template: CaptionTemplate,
): {style: CSSProperties; filter?: string} => {
  if (template.keywordPaint === "recorte") {
    return {style: {...CLIPPED_FILL, textShadow: "none"}};
  }
  const effect = template.keywordEffect;
  const fill = palette.keywordFill;
  if (fill.type === "solida") {
    return {style: {color: fill.color, textShadow: effect === "brilho" ? "var(--brilho)" : "var(--sombra)"}};
  }
  return {
    style: {
      ...CLIPPED_FILL,
      textShadow: "none",
      // Folga para a inclinação do itálico não sair do degradê.
      padding: "0 .08em",
      margin: "0 -.08em",
    },
    filter: effect === "brilho" ? "var(--brilho-filtro)" : "var(--sombra-filtro)",
  };
};

const cleanWord = (text: string): string => text.replace(/[,.:;]+(?=[!?]*$)/gu, "");

// Bloco na tela agora, pela linha do tempo de exibição. Se o bloco entrou depois
// de alguma palavra já ter sido falada (atraso pela palavra-chave do anterior), a
// animação dessa palavra começa na entrada do bloco.
const withEntry = (block: AssignedCaptionBlock, showMs: number): AssignedCaptionBlock => ({
  ...block,
  words: block.words.map((word) => ({...word, startMs: Math.max(word.startMs, showMs)})),
});

// Bloco na tela agora (e, numa dupla, o segundo bloco que divide a tela com ele).
const findActiveBlocks = (
  blocks: AssignedCaptionBlock[],
  timeline: BlockTiming[],
  currentMs: number,
): {block: AssignedCaptionBlock; partner?: AssignedCaptionBlock} | undefined => {
  const index = findActiveBlockIndex(timeline, currentMs);
  if (index < 0) {
    return undefined;
  }
  const block = withEntry(blocks[index], timeline[index].showMs);
  const next = blocks[index + 1];
  const partner =
    block.dupla === "primeiro" && next?.dupla === "segundo"
      ? withEntry(next, timeline[index + 1].showMs)
      : undefined;
  return {block, partner};
};

// Valor de um quadro-chave no instante t (0 a 1). A curva vale em cada trecho.
const sampleKeyframes = (
  frames: [number, number][],
  t: number,
  ease: (value: number) => number,
): number => {
  if (t <= frames[0][0]) {
    return frames[0][1];
  }
  for (let index = 1; index < frames.length; index++) {
    const [offset, value] = frames[index];
    const [previousOffset, previousValue] = frames[index - 1];
    if (t <= offset) {
      const local = offset === previousOffset ? 1 : (t - previousOffset) / (offset - previousOffset);
      return previousValue + (value - previousValue) * ease(local);
    }
  }
  return frames[frames.length - 1][1];
};

// Folga lateral (padding esquerdo + direito) em em, para contar na largura medida,
// como o offsetWidth do HTML conta o padding do .tx.
const horizontalPaddingEm = (style: CSSProperties): number => {
  const toEm = (value: unknown): number => {
    const match = /^(-?[\d.]+)em$/u.exec(String(value ?? "").trim());
    return match ? Number(match[1]) : 0;
  };
  if (style.paddingLeft !== undefined || style.paddingRight !== undefined) {
    return toEm(style.paddingLeft) + toEm(style.paddingRight);
  }
  const parts = String(style.padding ?? "").trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) {
    return 0;
  }
  const right = parts[1] ?? parts[0];
  const left = parts[3] ?? right;
  return toEm(left) + toEm(right);
};

// Mesma conta do script das referências HTML: mede o texto a 100px (com a folga
// lateral) e escala até a largura alvo, sem passar do teto. Retorna o tamanho em px.
const fitFontSize = (
  text: string,
  style: CSSProperties,
  fit: KeywordFit,
  videoWidth: number,
): number => {
  const {width} = measureText({
    text,
    fontFamily: String(style.fontFamily ?? ""),
    fontSize: 100,
    fontWeight: style.fontWeight as number | string | undefined,
    letterSpacing: style.letterSpacing === undefined ? undefined : String(style.letterSpacing),
    additionalStyles: {fontStyle: String(style.fontStyle ?? "normal")},
    // Caixa-alta/minúsculas mudam a largura: mede como o HTML mostra.
    textTransform: style.textTransform as Parameters<typeof measureText>[0]["textTransform"],
    validateFontIsLoaded: false,
  });
  const measured = width + horizontalPaddingEm(style) * 100;
  const target = (100 * ((fit.targetWidthPercent / 100) * videoWidth)) / Math.max(1, measured);
  const ceiling = (fit.maxFontPercent / 100) * videoWidth;
  return Number(Math.min(target, ceiling).toFixed(1));
};

const AnimatedWord: React.FC<{
  text: string;
  startMs: number;
  // Sincronia precisa: quando a palavra é falada (a entrada acelera se o bloco
  // entrou com antecedência reduzida, veja entradaAjustada).
  faladaMs?: number;
  animation: EntranceAnimation;
  style?: CSSProperties;
  // Filtro fixo somado ao desfoque da animação.
  filter?: string;
}> = ({text, startMs, faladaMs, animation: original, style, filter}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const animation = entradaAjustada(original, startMs, faladaMs, 1000 / fps);
  const elapsedMs = (frame / fps) * 1000 - startMs;
  const linear = Math.min(1, Math.max(0, elapsedMs / animation.durationMs));
  const ease = Easing.bezier(...animation.easing);
  const progress = ease(linear);
  const translateX = (animation.fromTranslateXEm ?? 0) * (1 - progress);
  const translateY = animation.fromTranslateYEm * (1 - progress);
  const scale = animation.fromScale + (1 - animation.fromScale) * progress;
  const blur = animation.fromBlurEm * (1 - progress);
  // Quadros-chave (ex.: a piscada): a curva vale em cada trecho, como no CSS.
  const opacity = animation.keyframes?.opacity
    ? sampleKeyframes(animation.keyframes.opacity, linear, ease)
    : animation.fromOpacity + (1 - animation.fromOpacity) * progress;
  const brightness = animation.keyframes?.brightness
    ? sampleKeyframes(animation.keyframes.brightness, linear, ease)
    : 1;

  return (
    <span
      style={{
        ...style,
        display: "inline-block",
        opacity,
        transform: `translate(${translateX}em, ${translateY}em) scale(${scale})`,
        filter:
          [blur > 0 ? `blur(${blur}em)` : "", brightness !== 1 ? `brightness(${brightness})` : "", filter ?? ""]
            .filter(Boolean)
            .join(" ") || "none",
      }}
    >
      {text}
    </span>
  );
};

// Palavras separadas por espaço normal, como no HTML de referência.
const spacedWords = (
  words: Word[],
  animation: EntranceAnimation,
  style?: CSSProperties,
): ReactNode[] =>
  words.flatMap((word, index) => [
    index > 0 ? " " : null,
    <AnimatedWord
      key={`${word.startMs}-${index}`}
      text={cleanWord(word.text)}
      startMs={word.startMs}
      faladaMs={word.faladaMs}
      animation={animation}
      style={style}
    />,
  ]);

// Linha de palavras em que a última recebe ênfase (o .forte do pacote B), se houver 2+.
const wordsWithEmphasis = (
  words: Word[],
  animation: EntranceAnimation,
  emphasis?: CSSProperties,
): ReactNode[] =>
  words.flatMap((word, index) => [
    index > 0 ? " " : null,
    <AnimatedWord
      key={`${word.startMs}-${index}`}
      text={cleanWord(word.text)}
      startMs={word.startMs}
      faladaMs={word.faladaMs}
      animation={animation}
      style={emphasis && words.length > 1 && index === words.length - 1 ? emphasis : undefined}
    />,
  ]);

// Quebra o linear em duas linhas equilibradas, sem deixar artigo/preposição no
// fim da primeira linha e sem cortar expressão protegida.
const splitIntoTwoLines = (words: Word[]): Word[][] => {
  const length = (part: Word[]) => part.map((word) => cleanWord(word.text)).join(" ").length;
  const {protectedCut} = findProtectedSpans(words.map((word) => word.text));
  let best: {cut: number; cost: number} | undefined;

  for (let cut = 1; cut < words.length; cut++) {
    const cost =
      Math.abs(length(words.slice(0, cut)) - length(words.slice(cut))) +
      (isBlockEndingFunctionWord(words[cut - 1].text) ? 500 : 0) +
      (protectedCut[cut] ? 1000 : 0) -
      (/[,;:.!?…]["')\]]*$/u.test(words[cut - 1].text) ? 10 : 0);
    if (!best || cost < best.cost) {
      best = {cut, cost};
    }
  }

  return best ? [words.slice(0, best.cut), words.slice(best.cut)] : [words];
};

const BlockContent: React.FC<{
  block: AssignedCaptionBlock;
  template: CaptionTemplate;
  palette: Palette;
  videoWidth: number;
}> = ({block, template, palette, videoWidth}) => {
  const {styles, animations, keywordFit} = template;
  const words = block.words;
  // Entrada de cada parte do layout (sem animação própria, usa a das palavras).
  const anim = {
    top: animations.top ?? animations.word,
    complement: animations.complement ?? animations.word,
    below: animations.below ?? animations.word,
  };
  const support = (part: Word[], extra?: CSSProperties, animation: EntranceAnimation = anim.top) =>
    part.length > 0 ? <div style={{...styles.support, ...extra}}>{spacedWords(part, animation)}</div> : null;
  // Palavras com uma entrada para cada posição (rótulos das pontas, linear de 2).
  const wordsEach = (part: Word[], animationAt: (index: number) => EntranceAnimation) =>
    part.flatMap((word, index) => [
      index > 0 ? " " : null,
      <AnimatedWord
        key={`${word.startMs}-${index}`}
        text={cleanWord(word.text)}
        startMs={word.startMs}
        faladaMs={word.faladaMs}
        animation={animationAt(index)}
      />,
    ]);
  const paint = keywordPaint(palette, template);
  const keywordSpan = (text: string, {startMs, faladaMs}: Word) => {
    const style: CSSProperties = {...styles.keyword, ...paint.style};
    if (keywordFit) {
      style.fontSize = fitFontSize(text, style, keywordFit, videoWidth);
    }
    const word = (
      <AnimatedWord
        text={text}
        startMs={startMs}
        faladaMs={faladaMs}
        animation={animations.keyword}
        style={style}
        filter={paint.filter}
      />
    );
    return styles.keywordOuter ? <span style={styles.keywordOuter}>{word}</span> : word;
  };
  // Linha extra para palavras que o layout não previu (nenhuma palavra some).
  const extraLine = (part: Word[]) =>
    part.length > 0 ? (
      <div style={styles.supportBelow ?? styles.support}>{spacedWords(part, anim.below)}</div>
    ) : null;

  if (template.structure === "linear") {
    const text = words.map((word) => cleanWord(word.text)).join(" ");
    const lines =
      words.length > 1 && text.length > (template.maxCharactersPerLine ?? Number.POSITIVE_INFINITY)
        ? splitIntoTwoLines(words)
        : [words];
    if (lines.length === 1) {
      const pairAnimations = animations.linearPair;
      return words.length === 2 && pairAnimations ? (
        <>{wordsEach(words, (index) => pairAnimations[index])}</>
      ) : (
        <>{spacedWords(words, animations.word)}</>
      );
    }
    return (
      <>
        {lines.map((line, index) => (
          <div key={index}>{spacedWords(line, animations.word)}</div>
        ))}
      </>
    );
  }

  if (template.structure === "bloco") {
    const {spans} = findProtectedSpans(words.map((word) => word.text));
    const [start, end] = spans[0] ?? [0, words.length];
    const first = words[start];
    const rest = words.slice(start + 1, end);
    return (
      <>
        {support(words.slice(0, start), {marginBottom: ".12em"})}
        {keywordSpan(cleanWord(first.text), first)}
        {rest.length > 0 ? (
          <span style={styles.complement}>
            {keywordSpan(rest.map((word) => cleanWord(word.text)).join(" "), rest[0])}
          </span>
        ) : null}
        {support(words.slice(end), {marginTop: ".12em"})}
      </>
    );
  }

  const keywordIndex = findKeywordIndex(words, block.keyword);
  const keyword = words[keywordIndex];
  const before = words.slice(0, keywordIndex);
  const after = words.slice(keywordIndex + 1);
  const keywordElement = keywordSpan(cleanWord(keyword.text), keyword);

  if (template.structure === "pesada-italica") {
    return (
      <>
        {support(before)}
        {keywordElement}
        {after.length > 0 ? (
          <span style={styles.complement}>{spacedWords(after, anim.complement)}</span>
        ) : null}
      </>
    );
  }

  if (template.structure === "escada") {
    const stepWord = before.slice(-1);
    return (
      <>
        {support(before.slice(0, -1))}
        {stepWord.length > 0 ? (
          <span style={styles.complement}>{spacedWords(stepWord, anim.complement)}</span>
        ) : null}
        {keywordElement}
        {support(after, undefined, anim.below)}
      </>
    );
  }

  if (template.structure === "rotulo-rodape" || template.structure === "topo-selo") {
    const topHasEmphasis = template.structure === "topo-selo";
    return (
      <>
        {before.length > 0 ? (
          <div style={styles.support}>
            {wordsWithEmphasis(before, anim.top, topHasEmphasis ? styles.emphasis : undefined)}
          </div>
        ) : null}
        {keywordElement}
        {after.length > 0 ? (
          <div style={styles.supportBelow}>
            {wordsWithEmphasis(after, anim.below, topHasEmphasis ? undefined : styles.emphasis)}
          </div>
        ) : null}
      </>
    );
  }

  if (template.structure === "dois-rotulos") {
    return (
      <>
        {before.length > 0 ? (
          <div style={styles.support}>
            {wordsEach(before, (index) =>
              index === 0
                ? (animations.labelLeft ?? anim.top)
                : index === before.length - 1
                  ? (animations.labelRight ?? anim.top)
                  : anim.top,
            )}
          </div>
        ) : null}
        {keywordElement}
        {after.length > 0 && styles.complement ? (
          <div style={styles.complement}>{spacedWords(after, anim.complement)}</div>
        ) : (
          extraLine(after)
        )}
      </>
    );
  }

  if (template.structure === "pilha") {
    return (
      <>
        {support(before.slice(0, -1))}
        {before.length > 0 ? (
          <div style={styles.complement}>{spacedWords(before.slice(-1), anim.complement)}</div>
        ) : null}
        {keywordElement}
        {extraLine(after)}
      </>
    );
  }

  if (template.structure === "tres-linhas") {
    return (
      <>
        {support(before)}
        <div>{keywordElement}</div>
        {after.length > 0 ? (
          <div style={styles.supportBelow}>{spacedWords(after, anim.below)}</div>
        ) : null}
      </>
    );
  }

  // "apoio-serifa" e "uma-palavra": apoio em cima, palavra-chave embaixo.
  return (
    <>
      {support(before)}
      <div>{keywordElement}</div>
      {support(after, undefined, anim.below)}
    </>
  );
};

// Os templates não posicionam o bloco: a posição vem da configuração (Posicionado).
const SEM_POSICAO_PROPRIA = ["position", "left", "top", "right", "bottom", "inset", "transform", "translate"];
const semPosicao = (style: CSSProperties): CSSProperties =>
  Object.fromEntries(Object.entries(style).filter(([chave]) => !SEM_POSICAO_PROPRIA.includes(chave)));

// Bloco (ou dupla) com o centro no ponto escolhido, empurrado para dentro da margem
// segura se não couber. O tamanho é medido no próprio bloco (offsetWidth não muda
// com a escala do Player).
const Posicionado: React.FC<{posicao: Posicao; children: ReactNode}> = ({posicao, children}) => {
  const {width, height} = useVideoConfig();
  const ref = useRef<HTMLDivElement>(null);
  const [tamanho, setTamanho] = useState<{largura: number; altura: number}>();
  useLayoutEffect(() => {
    const elemento = ref.current;
    if (elemento && (elemento.offsetWidth !== tamanho?.largura || elemento.offsetHeight !== tamanho?.altura)) {
      setTamanho({largura: elemento.offsetWidth, altura: elemento.offsetHeight});
    }
  });
  const centro = tamanho ? centroDentroDaMargem(posicao, tamanho.largura, tamanho.altura, width, height) : posicao;
  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: `${centro.x}%`,
        top: `${centro.y}%`,
        transform: "translate(-50%, -50%)",
        width: "max-content",
      }}
    >
      {children}
    </div>
  );
};

// As medidas da palavra-chave só valem com as fontes carregadas.
const useFontsReady = (): boolean => {
  const [handle] = useState(() => delayRender("Carregando fontes das legendas"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    waitForFonts()
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch((error: unknown) => cancelRender(error));
  }, [handle]);
  return ready;
};

export const KineticCaptionVideo: React.FC<KineticCaptionVideoProps> = ({
  videoSrc,
  blocks: blocosDaFala,
  templates,
  palette,
  palettes,
  efeitos,
  volumeEfeitos,
  sonsUrl,
  sincroniaMs,
  precisa,
  posicao,
  cortesMs,
  marcaDagua,
}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const fontsReady = useFontsReady();
  // Tempos de tela: a entrada começa antes da fala (veja src/entrada.ts).
  const blocks = useMemo(
    () => blocosNaTela(blocosDaFala, templates, sincroniaMs, precisa),
    [blocosDaFala, templates, sincroniaMs, precisa],
  );
  const timeline = useMemo(() => computeTimeline(blocks, cortesMs, fps), [blocks, cortesMs, fps]);
  const agoraMs = (frame / fps) * 1000;
  const active = findActiveBlocks(blocks, timeline, agoraMs);
  const indiceAtivo = findActiveBlockIndex(timeline, agoraMs);
  // Pacote C (estrutura "imobiliario", veja src/imobiliario.tsx): as cenas (âncora e
  // trilho) desenham os blocos delas; os blocos fora das cenas (único e linear)
  // continuam na tela enquanto saem, junto com a entrada do seguinte.
  const {cenas, blocosEmCena} = useMemo(() => montarCenas(blocks, templates, timeline), [blocks, templates, timeline]);
  const duracaoDaSaidaMs = (palavras: number) => (quadrosDaSaida(palavras) / fps) * 1000;
  const cenasNaTela = cenas.filter((cena) => agoraMs >= cena.inicioMs && agoraMs < cena.saidaMs + duracaoDaSaidaMs(palavrasDaCena(cena)));
  const configDoBloco = (block: AssignedCaptionBlock | undefined) => {
    const t = block ? templates[block.template] : undefined;
    return t?.structure === "imobiliario" ? (t.imobiliario ?? {papel: "cena" as const}) : undefined;
  };
  const saindo = timeline
    .map((tempo, indice) => ({tempo, indice}))
    .filter(
      ({tempo, indice}) =>
        indice !== indiceAtivo &&
        !blocosEmCena.has(indice) &&
        configDoBloco(blocks[indice]) !== undefined &&
        agoraMs >= tempo.hideMs &&
        agoraMs < tempo.hideMs + duracaoDaSaidaMs(blocks[indice].words.length),
    );
  // Arrastar move o conjunto: o quanto a posição saiu do padrão.
  const deslocamentoDe = (block: AssignedCaptionBlock) => {
    const escolhida = posicaoDoBloco(block.posicao, posicao);
    return {x: escolhida.x - POSICAO_PADRAO.x, y: escolhida.y - POSICAO_PADRAO.y};
  };
  const comPaleta = (block: AssignedCaptionBlock, key: string, conteudo: ReactNode) => {
    const own = paletteOf(block);
    return (
      <AbsoluteFill key={key} style={own ? paletteVariables(own) : undefined}>
        {conteudo}
      </AbsoluteFill>
    );
  };
  const blocoImobiliario = (block: AssignedCaptionBlock, indice: number) =>
    comPaleta(
      block,
      `c-${block.startMs}`,
      <BlocoImobiliario
        block={withEntry(block, timeline[indice].showMs)}
        indiceDoBloco={indice}
        config={configDoBloco(block)!}
        saidaMs={timeline[indice].hideMs}
        deslocamento={deslocamentoDe(block)}
      />,
    );
  const activeBlock = active?.block;
  const template = activeBlock ? templates[activeBlock.template] : undefined;
  const paletteOf = (block: AssignedCaptionBlock) => (block.paleta ? palettes?.[block.paleta] : undefined);
  const blockPalette = activeBlock ? paletteOf(activeBlock) : undefined;
  // Uma parte da dupla vira um template simples para desenhar cada bloco no seu grupo.
  const partTemplate = (part: TemplatePart): CaptionTemplate => ({
    ...template!,
    structure: part.structure,
    styles: {...part.styles, block: {}},
    keywordFit: part.keywordFit,
  });
  const pairGroup = (block: AssignedCaptionBlock, part: TemplatePart, groupStyle: CSSProperties) => {
    const own = paletteOf(block);
    return (
      <div style={own ? {...groupStyle, ...paletteVariables(own)} : groupStyle}>
        <BlockContent block={block} template={partTemplate(part)} palette={own ?? palette} videoWidth={width} />
      </div>
    );
  };

  return (
    // Sem vídeo (miniaturas da galeria): fundo preto.
    <AbsoluteFill style={videoSrc ? undefined : {background: "#000"}}>
      {videoSrc ? (
        <OffthreadVideo
          // Na renderização o vídeo vem da pasta pública; na prévia, de uma URL do servidor.
          src={/^(https?:|\/)/u.test(videoSrc) ? videoSrc : staticFile(videoSrc)}
          style={{width: "100%", height: "100%", objectFit: "contain"}}
        />
      ) : null}
      {/* Efeitos sonoros, cada um no seu quadro (veja src/sons.ts). */}
      {(volumeEfeitos ?? 0) > 0
        ? efeitos?.map((efeito) => {
            const volume = Math.min(100, volumeEfeitos ?? 0) / 100;
            // Arquivo gerado, já com o corte, o fade e um quadro de silêncio no começo
            // (veja somTocado).
            const {arquivo, de, quadros} = somTocado(efeito, fps);
            return (
              <Sequence
                key={`${efeito.bloco}-${efeito.arquivo}`}
                name={`Som ${efeito.arquivo}`}
                from={de}
                durationInFrames={quadros}
                layout="none"
              >
                <Html5Audio
                  // Na prévia, o som vem do servidor; na renderização, da pasta pública.
                  src={sonsUrl ? sonsUrl + arquivo.split("/").map(encodeURIComponent).join("/") : staticFile(`sons/${arquivo}`)}
                  // Volume fixo: o fade já está no arquivo.
                  volume={volume}
                />
              </Sequence>
            );
          })
        : null}
      {/* Equivale ao .q do HTML: 1cqw = 1% da largura do vídeo. */}
      <AbsoluteFill
        style={{containerType: "inline-size", overflow: "hidden", ...paletteVariables(palette)}}
      >
        {fontsReady
          ? cenasNaTela.map((cena) =>
              comPaleta(blocks[cena.bloco], `cena-${cena.id}`, <CenaImobiliaria cena={cena} deslocamento={deslocamentoDe(blocks[cena.bloco])} miniatura={!videoSrc} />),
            )
          : null}
        {fontsReady ? saindo.map(({indice}) => blocoImobiliario(blocks[indice], indice)) : null}
        {fontsReady && activeBlock && template && template.structure === "imobiliario" ? (
          blocosEmCena.has(indiceAtivo) ? null : blocoImobiliario(blocks[indiceAtivo], indiceAtivo)
        ) : fontsReady && activeBlock && template ? (
          // Centro do bloco no ponto escolhido (o do bloco, senão o geral). Na dupla,
          // o conjunto se move junto, pela posição do primeiro bloco.
          <Posicionado key={`${activeBlock.startMs}`} posicao={posicaoDoBloco(activeBlock.posicao, posicao)}>
            {template.structure === "dupla" && template.pair ? (
              // Dupla: o primeiro bloco num grupo, o segundo no outro, os dois na tela.
              <div style={semPosicao(template.styles.block)}>
                {pairGroup(activeBlock, template.pair.first, template.pair.firstGroup)}
                {active?.partner ? pairGroup(active.partner, template.pair.second, template.pair.secondGroup) : null}
              </div>
            ) : (
              // Bloco com paleta própria: as variáveis dela valem só dentro deste bloco.
              <div
                style={
                  blockPalette
                    ? {...semPosicao(template.styles.block), ...paletteVariables(blockPalette)}
                    : semPosicao(template.styles.block)
                }
              >
                <BlockContent
                  block={activeBlock}
                  template={template}
                  palette={blockPalette ?? palette}
                  videoWidth={width}
                />
              </div>
            )}
          </Posicionado>
        ) : null}
      </AbsoluteFill>
      {/* Por cima de tudo, com as fontes já carregadas (a marca usa a Inter Tight). */}
      {marcaDagua && fontsReady ? <MarcaDagua /> : null}
    </AbsoluteFill>
  );
};
