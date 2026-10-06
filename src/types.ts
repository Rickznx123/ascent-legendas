import type {CSSProperties} from "react";

export type Word = {
  text: string;
  startMs: number;
  endMs: number;
  // Só nos tempos de tela com a Sincronia precisa (veja blocosNaTela): o instante
  // em que a palavra é falada (startMs passa a ser o início da animação).
  faladaMs?: number;
};

// Trechos de voz do áudio [início, fim) em ms, separados por silêncios de 150 ms
// ou mais (veja src/motor/voz.ts), e a duração do áudio.
export type VozDoAudio = {
  trechos: [number, number][];
  duracaoMs: number;
};

// Sincronia precisa ligada: as palavras grudam nos começos e fins de voz (quando
// houver a voz do áudio) e a troca de blocos segue as regras de src/tempos.ts.
export type SincroniaPrecisa = {
  voz?: VozDoAudio;
  // Quadros por segundo do vídeo: a troca de blocos acontece no início do quadro
  // da fala (sem valor: 30).
  fps?: number;
};

export type CaptionBlock = {
  words: Word[];
  startMs: number;
  endMs: number;
  keyword: string;
  template: string;
  family?: TemplateFamily;
  review?: boolean;
  // O layout foi escolhido à mão na interface (não é trocado automaticamente).
  layoutManual?: boolean;
  // Pacote de onde veio o layout (no modo misto, o pacote sorteado).
  pacote?: string;
  // Paleta só deste bloco. Vazio: usa a paleta geral do vídeo.
  paleta?: string;
  // Dupla: dois blocos seguidos na tela ao mesmo tempo (layout de estrutura "dupla").
  dupla?: "primeiro" | "segundo";
  // Efeito sonoro. Vazio: automático; "nenhum": sem som; senão, o arquivo escolhido
  // à mão, relativo à pasta sons/ (ex.: "destaque/whoosh.wav").
  som?: string;
  // Posição só deste bloco (centro, em % da largura e da altura). Vazio: a geral.
  posicao?: {x: number; y: number};
};

export type TemplateFamily = "linear" | "destaque";

// Como as palavras do bloco são distribuídas pelos papéis do layout.
export type CaptionStructure =
  | "apoio-serifa" // apoio em cima, palavra-chave embaixo
  | "pesada-italica" // apoio em cima, palavra-chave, complemento depois
  | "escada" // apoio, palavra anterior à chave em itálico, palavra-chave
  | "bloco" // expressão protegida em duas linhas pesadas
  | "uma-palavra" // só a palavra-chave
  | "tres-linhas" // apoio em cima, palavra-chave no meio, apoio embaixo
  | "rotulo-rodape" // rótulo em cima, palavra-chave, rodapé (última palavra com ênfase)
  | "topo-selo" // topo (última palavra com ênfase), palavra-chave, selo embaixo
  | "dois-rotulos" // palavras de cima nas duas pontas, palavra-chave, complemento
  | "pilha" // duas linhas antes da palavra-chave (a de baixo é a última palavra antes dela)
  | "dupla" // dois blocos seguidos na tela ao mesmo tempo (veja CaptionTemplate.pair)
  | "imobiliario" // pacote C: grupo acima da cabeça e na altura do tronco, com motion blur (src/imobiliario.tsx)
  | "linear"; // palavras em sequência

// Entrada de cada palavra, equivalente a um @keyframes do CSS.
export type EntranceAnimation = {
  durationMs: number;
  // Curva cubic-bezier(x1, y1, x2, y2).
  easing: [number, number, number, number];
  fromOpacity: number;
  // Deslocamento vertical inicial, em em.
  fromTranslateYEm: number;
  // Desfoque inicial, em em.
  fromBlurEm: number;
  fromScale: number;
  // Deslocamento horizontal inicial, em em (negativo: vem da esquerda).
  fromTranslateXEm?: number;
  // Quadros-chave, como um @keyframes do CSS: [posição de 0 a 1, valor].
  // A curva (easing) vale em cada trecho entre dois quadros. Com quadros-chave de
  // opacidade, fromOpacity é ignorado. Brilho 1 = normal.
  keyframes?: {
    opacity?: [number, number][];
    brightness?: [number, number][];
  };
};

// Um efeito sonoro já planejado (veja src/sons.ts).
export type EfeitoSonoro = {
  bloco: number;
  // Arquivo relativo à pasta sons/.
  arquivo: string;
  // Quando o som começa a tocar.
  startMs: number;
  // Quanto do som toca (menos que o arquivo quando ele é cortado).
  duracaoMs: number;
  // Fade no fim, quando o som é cortado.
  fadeMs?: number;
};

// Mesma lógica de data-w / data-max do layouts-legenda.html.
export type KeywordFit = {
  // Largura alvo da palavra-chave, em % da largura do vídeo (data-w).
  targetWidthPercent: number;
  // Teto do tamanho da letra, em % da largura do vídeo (data-max).
  maxFontPercent: number;
};

// Paleta de cores. Os layouts não têm cor própria: leem tudo daqui.
export type PaletteFill =
  | {type: "solida"; color: string}
  | {
      type: "degrade";
      // Ângulo do degradê em graus (0 = de baixo para cima, 90 = da esquerda para a direita).
      angle: number;
      // Paradas do degradê; position vai de 0 a 100 (%).
      stops: {color: string; position: number}[];
    };

export type Palette = {
  // Cor das palavras de apoio, do complemento e do texto linear.
  supportColor: string;
  // Preenchimento da palavra-chave.
  keywordFill: PaletteFill;
  glow: {
    // Cor do brilho perto da letra (com transparência, ex.: "rgba(255,40,30,.75)").
    inner: string;
    // Cor do brilho espalhado mais longe.
    outer: string;
    // 1 = igual à referência; 0 = sem brilho; acima de 1 = mais forte.
    intensity: number;
  };
  shadow: {
    color: string;
  };
};

// Pacote C (estrutura "imobiliario"):
//   papel "cena"   — destaque: abre uma âncora (fixa) com o trilho (palavras passando);
//   papel "unico"  — bloco curto sozinho, num grupo central;
//   papel "linear" — bloco linear numa linha, fora das cenas.
export type ConfigImobiliario = {
  papel: "cena" | "unico" | "linear";
  // Ordem na tela: âncora em cima e trilho embaixo, ou o contrário.
  ordem?: "ancora-trilho" | "trilho-ancora";
  // De que lado as palavras entram no trilho (saem pelo outro).
  trilhoEntra?: "esquerda" | "direita";
  // Âncora com uma chave ou com duas (duas linhas grandes).
  chavesNaAncora?: 1 | 2;
  // Onde fica o conjunto: acima da cabeça ou na altura do tronco.
  altura?: "cabeca" | "tronco";
  // Linear e único: como as palavras entram.
  entrada?: "cima" | "baixo" | "lados";
};

// Uma parte de um layout composto (cada grupo da dupla).
export type TemplatePart = {
  structure: CaptionStructure;
  styles: CaptionTemplate["styles"];
  keywordFit?: KeywordFit;
};

export type CaptionTemplate = {
  family: TemplateFamily;
  structure: CaptionStructure;
  // Efeito de luz da palavra-chave: "brilho" (halo + sombra) ou "sombra" (só sombra).
  // Usado na pintura "texto"; na pintura "recorte" o brilho vem de keywordOuter.
  keywordEffect: "brilho" | "sombra";
  // Como a palavra-chave recebe a cor da paleta:
  //   "texto"   — cor do texto + text-shadow (pacote A);
  //   "recorte" — preenchimento recortado no texto (background-clip), com o brilho
  //               no elemento de fora (keywordOuter), como o .kw/.tx do pacote B.
  keywordPaint?: "texto" | "recorte";
  // Estilos CSS de cada papel, sem cores. Medidas em cqw = % da largura do vídeo.
  // Cores vêm da paleta pelas variáveis var(--cor-apoio), var(--sombra) e var(--brilho).
  styles: {
    block: CSSProperties;
    support?: CSSProperties;
    // Apoio embaixo da palavra-chave (layout de três linhas).
    supportBelow?: CSSProperties;
    keyword?: CSSProperties;
    // Elemento em volta da palavra-chave (o .kw do pacote B), onde fica o brilho.
    keywordOuter?: CSSProperties;
    // Ênfase da última palavra do rodapé ou do topo (o .forte do pacote B).
    emphasis?: CSSProperties;
    complement?: CSSProperties;
  };
  keywordFit?: KeywordFit;
  // Entrada de cada parte do layout. Só word e keyword são obrigatórias; as outras
  // partes usam word quando não forem dadas.
  animations: {
    word: EntranceAnimation;
    keyword: EntranceAnimation;
    // Linha de cima (apoio, rótulo, topo, primeira linha da pilha).
    top?: EntranceAnimation;
    // Complemento (palavra do meio da pilha, itálico embaixo, etc.).
    complement?: EntranceAnimation;
    // Rodapé, selo e apoio de baixo.
    below?: EntranceAnimation;
    // Os dois rótulos das pontas (estrutura dois-rotulos).
    labelLeft?: EntranceAnimation;
    labelRight?: EntranceAnimation;
    // Linear de exatamente 2 palavras: a entrada de cada uma.
    linearPair?: [EntranceAnimation, EntranceAnimation];
  };
  // Só para o linear: acima de quantos caracteres a linha é quebrada em duas.
  maxCharactersPerLine?: number;
  // Só na estrutura "imobiliario" (pacote C, src/imobiliario.tsx): o papel do layout
  // e a variação do desenho.
  imobiliario?: ConfigImobiliario;
  // Só na estrutura "dupla": o desenho de cada bloco e de cada grupo.
  pair?: {
    first: TemplatePart;
    second: TemplatePart;
    firstGroup: CSSProperties;
    secondGroup: CSSProperties;
  };
};

// Regras de um pacote: qual layout usar em cada situação (arquivo _pacote.ts).
export type CountRange = {min?: number; max?: number};

export type LayoutRule = {
  // Layouts usados, em alternância, quando a regra vale.
  templates: string[];
  // Condições; todas precisam valer. Sem condição, a regra vale sempre.
  words?: CountRange;
  before?: CountRange; // palavras antes da palavra-chave
  after?: CountRange; // palavras depois da palavra-chave
  protectedExpression?: boolean; // o bloco tem expressão protegida
};

export type PackageConfig = {
  // Layout dos blocos que não são destaque.
  linear: string;
  // Regras dos destaques, na ordem; vale a primeira que combinar.
  highlight: LayoutRule[];
  // Layouts de três linhas: junção com o bloco seguinte e palavra-chave primeiro.
  threeLines: string[];
  // Layout de dupla do pacote (opcional): dois blocos curtos e próximos na tela juntos.
  dupla?: string;
  // Máximo de palavras do linear (opcional). Um linear maior é dividido em dois;
  // no modo misto, ele não sorteia este pacote.
  maxLinearWords?: number;
  // Texto de exemplo das miniaturas da galeria (opcional): as palavras e qual
  // delas é a palavra-chave.
  exemplo?: {texto: string; palavraChave: string};
  // Nomes antigos de layouts que não existem mais (opcional): cada um desenha com o
  // layout novo indicado. Projetos salvos com os nomes antigos continuam abrindo.
  // Não aparecem na galeria.
  aliases?: Record<string, string>;
};

export type AssignedCaptionBlock = CaptionBlock & {
  family: TemplateFamily;
  template: string;
};

export type VideoMetadata = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export type KineticCaptionVideoProps = {
  videoSrc: string;
  blocks: AssignedCaptionBlock[];
  templates: Record<string, CaptionTemplate>;
  palette: Palette;
  // Todas as paletas, para os blocos que têm paleta própria.
  palettes?: Record<string, Palette>;
  video: VideoMetadata;
  // Efeitos sonoros, misturados ao áudio do vídeo.
  efeitos?: EfeitoSonoro[];
  // Volume geral dos efeitos, de 0 a 100.
  volumeEfeitos?: number;
  // Endereço da pasta sons/ na prévia ("/sons/"). Vazio: pasta pública do render.
  sonsUrl?: string;
  // Ajuste de sincronia das legendas em ms (positivo atrasa, negativo adianta).
  sincroniaMs?: number;
  // Sincronia precisa (vazio: desligada).
  precisa?: SincroniaPrecisa;
  // Posição geral das legendas (centro do bloco, em %). Vazio: 50% × 68%.
  posicao?: {x: number; y: number};
  // Instantes (de tela) em que começavam blocos excluídos: o bloco anterior não
  // fica na tela depois deles.
  cortesMs?: number[];
  // Marca d'água do plano grátis (veja src/marca-dagua.tsx). No vídeo exportado,
  // definida pelo servidor conforme o plano; na prévia, só mostra o que vai sair.
  marcaDagua?: boolean;
};
