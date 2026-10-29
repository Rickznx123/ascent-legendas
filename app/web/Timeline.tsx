// Editor de cortes (PLANO-CORTES.md, Blocos 2, 3 e 6; desenho em
// editor-cortes-referencia.html): a prévia tocando só os trechos (nada é montado), os
// controles e a timeline com régua, V1 (miniaturas) e A1 (forma de onda real). V1 e A1
// são o mesmo trecho: cortar, aparar ou mover um mexe no outro.
// Computador: a agulha anda pela régua ou pela cabeça; tocar num trecho o escolhe e
// leva a agulha ao ponto; arrastar reordena. Celular (estilo CapCut): a agulha fica no
// centro e a timeline rola por baixo; segurar um trecho e arrastar reordena; dois dedos
// dão zoom. As bordas de aparar aparecem no trecho escolhido.
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {Player} from "@remotion/player";
import type {PlayerRef} from "@remotion/player";
import {AbsoluteFill, Html5Video, Series} from "remotion";
import {api, tituloDoVideo} from "./api";
import type {Catalogo, Trecho} from "./api";
import type {Salvamento} from "./BarraTopo";
import {usePreviaLeve} from "./previa-leve";
import {FPS, ONDA_MS, aparar, dividir, duracaoDe, duracaoTotal, excluir, fimDe, mover, msDoQuadro, noVideo, quadroDe, quadrosDe} from "./trechos";
import type {Duracoes} from "./trechos";

const ESPERA_PARA_SALVAR_MS = 800;
const MAXIMO_NO_HISTORICO = 100;
// Menos que isso é um toque, não um arrasto.
const ARRASTO_MINIMO_PX = 6;
// Com o dedo, segurar parado este tempo num trecho começa a reordenar.
const SEGURAR_PARA_ARRASTAR_MS = 500;
// Zoom da timeline, em px por segundo de vídeo.
const ZOOM = {inicial: 40, menor: 8, maior: 160, passo: 1.4};
// O que a mídia arrasta para a timeline (o nome do vídeo).
export const TIPO_DO_ARRASTO = "application/x-video-do-projeto";

type Historico = {lista: Trecho[]; passado: Trecho[][]; futuro: Trecho[][]};

// Os trechos do projeto, com desfazer/refazer só da timeline e salvamento com espera
// curta (como o das legendas). salvarAgora: antes de sair para as legendas.
export const useTimeline = (id: string, inicial: Trecho[]) => {
  const [h, setH] = useState<Historico>({lista: inicial, passado: [], futuro: []});
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const salvo = useRef(inicial);
  const atual = useRef(inicial);
  atual.current = h.lista;
  const timer = useRef<number | undefined>(undefined);
  const antesDoGesto = useRef<Trecho[] | undefined>(undefined);

  const guardar = (historico: Historico, antes: Trecho[], lista: Trecho[]): Historico => ({
    lista,
    passado: [...historico.passado, antes].slice(-MAXIMO_NO_HISTORICO),
    futuro: [],
  });
  // noHistorico falso: um passo de um arrasto (o gesto inteiro vira um passo só no fim).
  const mudar = useCallback((fn: (lista: Trecho[]) => Trecho[], noHistorico = true) => {
    setH((historico) => {
      const lista = fn(historico.lista);
      if (lista === historico.lista) return historico;
      return noHistorico ? guardar(historico, historico.lista, lista) : {...historico, lista};
    });
  }, []);
  const inicioDoGesto = () => {
    antesDoGesto.current = atual.current;
  };
  const fimDoGesto = () => {
    const antes = antesDoGesto.current;
    antesDoGesto.current = undefined;
    if (antes) setH((historico) => (historico.lista === antes ? historico : guardar(historico, antes, historico.lista)));
  };
  const desfazer = () =>
    setH(({lista, passado, futuro}) => (passado.length ? {lista: passado[passado.length - 1], passado: passado.slice(0, -1), futuro: [lista, ...futuro]} : {lista, passado, futuro}));
  const refazer = () =>
    setH(({lista, passado, futuro}) => (futuro.length ? {lista: futuro[0], passado: [...passado, lista], futuro: futuro.slice(1)} : {lista, passado, futuro}));

  const enviar = useCallback(
    async (lista: Trecho[]) => {
      setSalvamento("salvando");
      try {
        await api.salvarProjetoComTimeline(id, {timeline: {trechos: lista}});
        salvo.current = lista;
        setSalvamento(atual.current === lista ? "salvo" : "pendente");
      } catch (erro) {
        setSalvamento("erro");
        throw erro;
      }
    },
    [id],
  );
  useEffect(() => {
    if (h.lista === salvo.current) return;
    setSalvamento("pendente");
    timer.current = window.setTimeout(() => void enviar(h.lista).catch(() => undefined), ESPERA_PARA_SALVAR_MS);
    return () => window.clearTimeout(timer.current);
  }, [h.lista, enviar]);
  // Saiu da tela com uma mudança ainda na espera: salva já.
  useEffect(
    () => () => {
      if (atual.current !== salvo.current) void api.salvarProjetoComTimeline(id, {timeline: {trechos: atual.current}}).catch(() => undefined);
    },
    [id],
  );
  const salvarAgora = async () => {
    window.clearTimeout(timer.current);
    if (atual.current !== salvo.current) await enviar(atual.current);
  };

  return {
    id,
    lista: h.lista,
    mudar,
    inicioDoGesto,
    fimDoGesto,
    desfazer,
    refazer,
    podeDesfazer: h.passado.length > 0,
    podeRefazer: h.futuro.length > 0,
    salvamento,
    salvarAgora,
  };
};
export type TimelineDoProjeto = ReturnType<typeof useTimeline>;

export type InfoDoVideo = {duracaoMs?: number; largura?: number; altura?: number; capa?: string; fonte?: string; erro?: string};

// Sem tela: lê a duração e acompanha a prévia leve (capa e endereço) de um vídeo.
export const LerVideo: React.FC<{nome: string; onInfo: (nome: string, info: InfoDoVideo) => void}> = ({nome, onInfo}) => {
  const {estado} = usePreviaLeve(nome);
  const [meta, setMeta] = useState<{duracaoMs: number; largura: number; altura: number} | {erro: string}>();
  useEffect(() => {
    api
      .videoInfo(nome)
      .then((info) => setMeta({duracaoMs: (info.durationInFrames / info.fps) * 1000, largura: info.width, altura: info.height}))
      .catch((erro: unknown) => setMeta({erro: erro instanceof Error ? erro.message : String(erro)}));
  }, [nome]);
  const capa = estado && "capa" in estado ? estado.capa : undefined;
  const fonte = estado?.estado === "pronta" ? estado.video : estado?.estado === "local" ? api.videoUrl(nome) : undefined;
  useEffect(() => onInfo(nome, {...meta, capa, fonte}), [nome, meta, capa, fonte, onInfo]);
  return null;
};

type PropsDaSequencia = {trechos: Trecho[]; duracoes: Duracoes; fontes: Record<string, string | undefined>};

// A prévia: um vídeo por trecho, um depois do outro, cada um começando no corte.
const Sequencia: React.FC<PropsDaSequencia> = ({trechos, duracoes, fontes}) => {
  const quadros = quadrosDe(trechos, duracoes);
  return (
    <AbsoluteFill style={{background: "#000"}}>
      <Series>
        {trechos.map((t, i) => {
          const fonte = fontes[t.video];
          return (
            <Series.Sequence key={t.id} durationInFrames={quadros[i]}>
              {fonte ? (
                <Html5Video src={fonte} trimBefore={Math.round((t.inicioMs * FPS) / 1000)} style={{width: "100%", height: "100%", objectFit: "contain"}} />
              ) : (
                <AbsoluteFill style={{alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 48}}>Preparando a prévia…</AbsoluteFill>
              )}
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};

// Forma de onda de um trecho (canal A1): os picos do vídeo (0 a 255, um a cada
// ONDA_MS) entre o começo e o fim do trecho, uma barra a cada 3 px, num canvas.
const Onda: React.FC<{picos?: Uint8Array; maximo: number; inicioMs: number; fimMs: number; largura: number}> = ({picos, maximo, inicioMs, fimMs, largura}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const altura = canvas.clientHeight;
    // shortcut: canvas até 16000 px de largura (o navegador recusa maiores); num trecho longo em zoom máximo as barras esticam.
    const escala = Math.min(window.devicePixelRatio || 1, 16000 / Math.max(1, largura));
    canvas.width = Math.max(1, Math.round(largura * escala));
    canvas.height = Math.max(1, Math.round(altura * escala));
    if (!picos?.length) return;
    g.fillStyle = getComputedStyle(canvas).color;
    const barras = Math.max(1, Math.floor(largura / 3));
    const passo = (fimMs - inicioMs) / barras;
    for (let i = 0; i < barras; i++) {
      const de = Math.floor((inicioMs + passo * i) / ONDA_MS);
      const ate = Math.max(de + 1, Math.floor((inicioMs + passo * (i + 1)) / ONDA_MS));
      let pico = 0;
      for (let j = de; j < ate && j < picos.length; j++) pico = Math.max(pico, picos[j]);
      const h = Math.max(1, (pico / maximo) * altura * 0.85);
      g.fillRect(i * 3 * escala, ((altura - h) / 2) * escala, 2 * escala, h * escala);
    }
  }, [picos, maximo, inicioMs, fimMs, largura]);
  return <canvas ref={ref} />;
};

// ponteiro: o dedo (ou mouse) do gesto; um segundo dedo não mexe nele.
type Gesto =
  | {tipo: "aparar"; ponteiro: number; id: string; lado: "inicio" | "fim"; x0: number; ms0: number; base: Trecho[]}
  | {tipo: "trecho"; ponteiro: number; indice: number; x0: number; y0: number; arrastar: boolean};

// "1:05.3" (controles) e "1:05" (régua).
const tempo = (ms: number) => `${Math.floor(ms / 60_000)}:${((ms % 60_000) / 1000).toFixed(1).padStart(4, "0")}`;
const tempoCurto = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;
// Marcas da régua: uma a cada meio passo, com o tempo escrito a cada passo (em segundos).
const passoDaRegua = (pxPorSegundo: number) => (pxPorSegundo >= 60 ? 1 : pxPorSegundo >= 25 ? 2 : pxPorSegundo >= 12 ? 5 : 10);

type Props = {
  t: TimelineDoProjeto;
  catalogo: Catalogo;
  infos: Record<string, InfoDoVideo>;
  ondas: Record<string, Uint8Array>;
  celular: boolean;
  travado: boolean;
  removendoPausas: boolean;
  onRemoverPausas: () => void;
  // Um vídeo da mídia solto na timeline (posição: entre quais trechos) e arquivos soltos (importar).
  onSoltarVideo: (nome: string, posicao: number) => void;
  onSoltarArquivos: (arquivos: File[]) => void;
  // Celular: o "+" da timeline abre a mídia.
  onAbrirMidia: () => void;
};

// A prévia, os controles e a timeline (a mídia e o topo ficam em Projetos.tsx). Devolve
// as áreas da grade do editor (.ec).
export const EditorDaTimeline: React.FC<Props> = ({t, catalogo, infos, ondas, celular, travado, removendoPausas, onRemoverPausas, onSoltarVideo, onSoltarArquivos, onAbrirMidia}) => {
  const {lista, mudar} = t;
  const nomes = useMemo(() => [...new Set(lista.map((trecho) => trecho.video))], [lista]);
  const duracoes = useMemo(
    () => Object.fromEntries(Object.entries(infos).flatMap(([nome, info]) => (info.duracaoMs ? [[nome, info.duracaoMs]] : []))) as Duracoes,
    [infos],
  );
  const fontes = useMemo(() => Object.fromEntries(Object.entries(infos).map(([nome, info]) => [nome, info.fonte])), [infos]);
  const pronto = nomes.every((nome) => duracoes[nome]);
  const erroDeLeitura = nomes.map((nome) => infos[nome]?.erro).find(Boolean);
  const total = pronto ? duracaoTotal(lista, duracoes) : 0;
  // O maior pico de cada vídeo: a onda ocupa a altura do canal mesmo num áudio baixo.
  const maximos = useMemo(() => Object.fromEntries(Object.entries(ondas).map(([nome, picos]) => [nome, Math.max(1, ...picos)])), [ondas]);

  // A agulha (cursor) e a prévia: mexer na agulha leva a prévia ao quadro do trecho certo;
  // tocando, a prévia move a agulha.
  const [cursorMs, setCursorMs] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [selecionado, setSelecionado] = useState<string>();
  const player = useRef<PlayerRef>(null);
  const conta = useRef({lista, duracoes, total});
  conta.current = {lista, duracoes, total};
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const aoQuadro = ({detail}: {detail: {frame: number}}) => setCursorMs(msDoQuadro(conta.current.lista, conta.current.duracoes, detail.frame));
    const aoTocar = () => setTocando(true);
    const aoParar = () => setTocando(false);
    p.addEventListener("frameupdate", aoQuadro);
    p.addEventListener("play", aoTocar);
    p.addEventListener("pause", aoParar);
    p.addEventListener("ended", aoParar);
    return () => {
      p.removeEventListener("frameupdate", aoQuadro);
      p.removeEventListener("play", aoTocar);
      p.removeEventListener("pause", aoParar);
      p.removeEventListener("ended", aoParar);
    };
  }, [pronto, lista.length]);
  const irPara = (ms: number) => {
    const {lista: atual, duracoes: d, total: fim} = conta.current;
    const limitado = Math.min(Math.max(0, ms), Math.max(0, fim - 1));
    setCursorMs(limitado);
    player.current?.seekTo(quadroDe(atual, d, limitado));
  };
  const tocarOuParar = () => {
    const p = player.current;
    if (!p) return;
    if (p.isPlaying()) {
      p.pause();
    } else {
      if (cursorMs >= total - 50) irPara(0);
      p.play();
    }
  };

  const sobOCursor = pronto ? noVideo(lista, duracoes, cursorMs) : undefined;
  const alvo = lista.find((trecho) => trecho.id === selecionado) ?? (sobOCursor ? lista[sobOCursor.indice] : undefined);
  const dividirNoCursor = () => mudar((atual) => dividir(atual, duracoes, cursorMs));
  const excluirAlvo = () => {
    if (!alvo) return;
    mudar((atual) => excluir(atual, alvo.id));
    setSelecionado(undefined);
  };

  // Atalhos: S divide, Delete exclui, Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y), espaço toca.
  // Na captura e parando ali: o Ctrl+Z e o espaço das legendas (useEditor) não agem nesta tela.
  const atalhos = useRef({dividirNoCursor, excluirAlvo, tocarOuParar, desfazer: t.desfazer, refazer: t.refazer, ativo: pronto && !travado});
  atalhos.current = {dividirNoCursor, excluirAlvo, tocarOuParar, desfazer: t.desfazer, refazer: t.refazer, ativo: pronto && !travado};
  useEffect(() => {
    const aoTeclar = (event: KeyboardEvent) => {
      const a = atalhos.current;
      if (!a.ativo || (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']"))) return;
      const tecla = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      const acao =
        ctrl && tecla === "z" ? (event.shiftKey ? a.refazer : a.desfazer)
        : ctrl && tecla === "y" ? a.refazer
        : !ctrl && tecla === "s" ? a.dividirNoCursor
        : !ctrl && (tecla === "delete" || tecla === "backspace") ? a.excluirAlvo
        : !ctrl && event.code === "Space" ? a.tocarOuParar
        : undefined;
      if (!acao) return;
      event.preventDefault();
      event.stopPropagation();
      acao();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  // Escala em px por segundo. No celular, a timeline tem meia tela de folga dos dois
  // lados: com a agulha fixa no centro, dá para levar o começo e o fim até ela.
  const rolar = useRef<HTMLDivElement>(null);
  const trilhas = useRef<HTMLDivElement>(null);
  const [pxPorSegundo, setPxPorSegundo] = useState(ZOOM.inicial);
  const [larguraVisivel, setLarguraVisivel] = useState(0);
  useEffect(() => {
    const elemento = rolar.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setLarguraVisivel(entrada.contentRect.width));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  const escala = pxPorSegundo / 1000;
  const folga = celular ? larguraVisivel / 2 : 0;
  const msNoPonto = (clientX: number) => (clientX - (trilhas.current?.getBoundingClientRect().left ?? 0) - folga) / escala;
  // Zoom: no computador a agulha fica no mesmo ponto da tela; no celular ela já é o centro.
  const agulhaNaTela = useRef<number | undefined>(undefined);
  const mudarZoom = (novo: number) => {
    if (rolar.current) agulhaNaTela.current = cursorMs * escala - rolar.current.scrollLeft;
    setPxPorSegundo(Math.min(ZOOM.maior, Math.max(ZOOM.menor, novo)));
  };

  // Rolagem e agulha. Celular: a agulha é o centro, então a posição da rolagem é o tempo
  // (a rolagem feita aqui é reconhecida pelo alvo e não volta como gesto da pessoa).
  // Computador: a rolagem segue a agulha quando ela sai da tela (tocando).
  const alvoDaRolagem = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const elemento = rolar.current;
    if (!elemento) return;
    const x = cursorMs * escala;
    if (celular) {
      if (Math.abs(elemento.scrollLeft - x) > 1) {
        alvoDaRolagem.current = x;
        elemento.scrollLeft = x;
      }
    } else if (agulhaNaTela.current !== undefined) {
      elemento.scrollLeft = x - agulhaNaTela.current;
      agulhaNaTela.current = undefined;
    } else if (x < elemento.scrollLeft || x > elemento.scrollLeft + elemento.clientWidth - 24) {
      elemento.scrollLeft = Math.max(0, x - 48);
    }
  }, [celular, cursorMs, escala, folga]);
  const aoRolar = () => {
    const elemento = rolar.current;
    if (!celular || !elemento || !pronto) return;
    const alvoAtual = alvoDaRolagem.current;
    if (alvoAtual !== undefined && Math.abs(elemento.scrollLeft - alvoAtual) < 2) return;
    alvoDaRolagem.current = undefined;
    if (player.current?.isPlaying()) player.current.pause();
    irPara(elemento.scrollLeft / escala);
  };

  // Agulha do computador: arrastar pela régua ou pela cabeça.
  const aoApertarAgulha = (event: React.PointerEvent) => {
    if (celular || !pronto) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    irPara(msNoPonto(event.clientX));
  };
  const aoArrastarAgulha = (event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) irPara(msNoPonto(event.clientX));
  };

  const comecos = lista.reduce<number[]>((soma, trecho, i) => [...soma, i === 0 ? 0 : soma[i - 1] + duracaoDe(lista[i - 1], duracoes)], []);
  const gesto = useRef<Gesto | undefined>(undefined);
  const [arrasto, setArrasto] = useState<{indice: number; dx: number; para: number}>();
  // Para onde vai um trecho (arrastado ou solto da mídia): depois de todos os outros cujo meio ficou à esquerda.
  const destino = (ms: number, sem?: number) => lista.filter((trecho, i) => i !== sem && comecos[i] + duracaoDe(trecho, duracoes) / 2 < ms).length;

  const segurar = useRef<number | undefined>(undefined);
  const pinca = useRef<{distancia: number; px: number} | undefined>(undefined);
  const toques = useRef(new Map<number, {x: number; y: number}>());

  const aoApertarBorda = (event: React.PointerEvent, trecho: Trecho, lado: "inicio" | "fim") => {
    event.stopPropagation();
    if (travado || pinca.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    t.inicioDoGesto();
    gesto.current = {
      tipo: "aparar",
      ponteiro: event.pointerId,
      id: trecho.id,
      lado,
      x0: event.clientX,
      ms0: lado === "inicio" ? trecho.inicioMs : fimDe(trecho, duracoes),
      base: lista,
    };
  };
  const aoApertarTrecho = (event: React.PointerEvent, indice: number) => {
    if (travado || pinca.current) return;
    const mouse = event.pointerType !== "touch";
    if (mouse) event.currentTarget.setPointerCapture(event.pointerId);
    const g: Gesto = {tipo: "trecho", ponteiro: event.pointerId, indice, x0: event.clientX, y0: event.clientY, arrastar: mouse};
    gesto.current = g;
    // Dedo parado por um instante: agora arrastar reordena (e a trilha para de rolar).
    if (!mouse) {
      window.clearTimeout(segurar.current);
      segurar.current = window.setTimeout(() => {
        if (gesto.current !== g) return;
        g.arrastar = true;
        setSelecionado(lista[indice].id);
        setArrasto({indice, dx: 0, para: indice});
        navigator.vibrate?.(15);
      }, SEGURAR_PARA_ARRASTAR_MS);
    }
  };
  const aoMover = (event: React.PointerEvent) => {
    const g = gesto.current;
    if (!g || g.ponteiro !== event.pointerId || pinca.current) return;
    const dx = event.clientX - g.x0;
    if (g.tipo === "aparar") {
      mudar(() => aparar(g.base, duracoes, g.id, g.lado, g.ms0 + dx / escala), false);
    } else if (g.arrastar && (arrasto || Math.abs(dx) > ARRASTO_MINIMO_PX)) {
      setArrasto({indice: g.indice, dx, para: destino(msNoPonto(event.clientX), g.indice)});
    } else if (Math.hypot(dx, event.clientY - g.y0) > ARRASTO_MINIMO_PX) {
      // O dedo andou antes de segurar: é rolagem, não arrasto.
      window.clearTimeout(segurar.current);
    }
  };
  const aoSoltar = (event: React.PointerEvent) => {
    const g = gesto.current;
    if (g && g.ponteiro !== event.pointerId) return;
    window.clearTimeout(segurar.current);
    gesto.current = undefined;
    if (g?.tipo === "aparar") {
      t.fimDoGesto();
    } else if (g && arrasto) {
      if (arrasto.para !== arrasto.indice) mudar((atual) => mover(atual, arrasto.indice, arrasto.para));
      setArrasto(undefined);
    } else if (g) {
      // Tocar escolhe o trecho; no computador, também leva a agulha ao ponto.
      setSelecionado(lista[g.indice].id);
      if (!celular) irPara(msNoPonto(event.clientX));
    }
  };
  const aoCancelar = () => {
    window.clearTimeout(segurar.current);
    if (gesto.current?.tipo === "aparar") t.fimDoGesto();
    gesto.current = undefined;
    setArrasto(undefined);
  };

  // Pinça (celular): dois dedos na trilha mudam o zoom.
  const dedos = () => [...toques.current.values()];
  const aoTocarNaTrilha = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    toques.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (toques.current.size === 2) {
      aoCancelar();
      const [a, b] = dedos();
      pinca.current = {distancia: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), px: pxPorSegundo};
    }
  };
  const aoMoverNaTrilha = (event: React.PointerEvent) => {
    if (!toques.current.has(event.pointerId)) return;
    toques.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    const p = pinca.current;
    if (!p || toques.current.size < 2) return;
    const [a, b] = dedos();
    mudarZoom((p.px * Math.hypot(a.x - b.x, a.y - b.y)) / p.distancia);
  };
  const aoSoltarDaTrilha = (event: React.PointerEvent) => {
    toques.current.delete(event.pointerId);
    if (toques.current.size < 2) pinca.current = undefined;
  };
  // Arrastando um trecho, aparando ou com dois dedos: a trilha (e a página) não rolam
  // nem dão zoom. Só um toque que ainda não começou a rolar pode ser cancelado assim.
  useEffect(() => {
    const elemento = rolar.current;
    if (!elemento) return;
    const aoArrastarODedo = (event: TouchEvent) => {
      const g = gesto.current;
      if (event.touches.length > 1 || pinca.current || g?.tipo === "aparar" || (g?.tipo === "trecho" && g.arrastar)) event.preventDefault();
    };
    elemento.addEventListener("touchmove", aoArrastarODedo, {passive: false});
    return () => elemento.removeEventListener("touchmove", aoArrastarODedo);
  }, []);

  // Soltar da mídia (computador): um vídeo do projeto entra onde caiu; arquivos são importados.
  const [alvoDoSoltar, setAlvoDoSoltar] = useState(false);
  const aoArrastarPorCima = (event: React.DragEvent) => {
    if (travado || (!event.dataTransfer.types.includes(TIPO_DO_ARRASTO) && !event.dataTransfer.types.includes("Files"))) return;
    event.preventDefault();
    setAlvoDoSoltar(true);
  };
  const aoSoltarNaTimeline = (event: React.DragEvent) => {
    event.preventDefault();
    setAlvoDoSoltar(false);
    const nome = event.dataTransfer.getData(TIPO_DO_ARRASTO);
    if (nome) onSoltarVideo(nome, destino(msNoPonto(event.clientX)));
    else if (event.dataTransfer.files.length > 0) onSoltarArquivos([...event.dataTransfer.files]);
  };

  const primeiro = lista[0] ? infos[lista[0].video] : undefined;
  const marcaDoArrasto = arrasto ? lista.filter((_, i) => i !== arrasto.indice).slice(0, arrasto.para).reduce((soma, trecho) => soma + duracaoDe(trecho, duracoes), 0) : 0;
  const passo = passoDaRegua(pxPorSegundo);
  const marcas = pronto ? Array.from({length: Math.ceil((total / 1000 + 5) / (passo / 2)) + 1}, (_, i) => (i * passo) / 2) : [];
  const vazio = lista.length === 0 ? (celular ? "Toque em + para adicionar vídeos" : "Arraste vídeos da mídia para cá") : !pronto ? (erroDeLeitura ?? "Lendo os vídeos…") : undefined;
  const trilhaComEventos = {
    onDragOver: aoArrastarPorCima,
    onDragLeave: () => setAlvoDoSoltar(false),
    onDrop: aoSoltarNaTimeline,
  };
  const clipe = (trecho: Trecho, i: number, canal: "v" | "a") => {
    const largura = duracaoDe(trecho, duracoes) * escala;
    const capa = infos[trecho.video]?.capa;
    return (
      <div
        key={trecho.id}
        className={`ec-clipe ec-clipe-${canal}${trecho.id === alvo?.id ? " ec-sel" : ""}${arrasto?.indice === i ? " ec-arrastado" : ""}`}
        style={{
          left: folga + comecos[i] * escala,
          width: largura,
          backgroundImage: canal === "v" && capa ? `url("${capa}")` : undefined,
          transform: arrasto?.indice === i ? `translateX(${arrasto.dx}px)` : undefined,
        }}
        onPointerDown={(event) => aoApertarTrecho(event, i)}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoCancelar}
        // O toque longo do celular não abre o menu (ele começa o arrasto).
        onContextMenu={(event) => event.preventDefault()}
      >
        {canal === "a" ? (
          <Onda picos={ondas[trecho.video]} maximo={maximos[trecho.video] ?? 255} inicioMs={trecho.inicioMs} fimMs={fimDe(trecho, duracoes)} largura={largura} />
        ) : (
          <span className="ec-clipe-nome">{tituloDoVideo(catalogo, trecho.video)}</span>
        )}
        {/* Bordas de aparar: só no trecho escolhido (sem isso, rolar a trilha no celular aparava sem querer). */}
        {canal === "v" && trecho.id === alvo?.id && !travado ? (
          <>
            <span className="ec-borda ec-borda-inicio" aria-label="Aparar o começo" onPointerDown={(event) => aoApertarBorda(event, trecho, "inicio")} />
            <span className="ec-borda ec-borda-fim" aria-label="Aparar o fim" onPointerDown={(event) => aoApertarBorda(event, trecho, "fim")} />
          </>
        ) : null}
      </div>
    );
  };

  const podeEditar = pronto && lista.length > 0 && !travado;
  return (
    <>
      <main className="ec-previa">
        {pronto && lista.length > 0 ? (
          <Player
            ref={player}
            component={Sequencia}
            inputProps={{trechos: lista, duracoes, fontes}}
            durationInFrames={Math.max(1, quadrosDe(lista, duracoes).reduce((a, b) => a + b, 0))}
            fps={FPS}
            compositionWidth={primeiro?.largura ?? 1080}
            compositionHeight={primeiro?.altura ?? 1920}
            style={{width: "100%", height: "100%"}}
            clickToPlay
            acknowledgeRemotionLicense
          />
        ) : (
          <p className="suave">{vazio}</p>
        )}
      </main>

      <div className="ec-controles">
        <button type="button" className="ec-play" disabled={!podeEditar} aria-label={tocando ? "Pausar" : "Tocar"} onClick={tocarOuParar}>
          {tocando ? "❚❚" : "▶"}
        </button>
        <div className="ec-tempo">
          <b>{tempo(cursorMs)}</b> / {tempo(total)}
        </div>
        {celular ? null : (
          <div className="ec-ferramentas">
            <button type="button" className="bt" disabled={!podeEditar} onClick={dividirNoCursor} title="Dividir na agulha (S)">
              ✂ Dividir
            </button>
            <button type="button" className="bt" disabled={!podeEditar || !alvo} onClick={excluirAlvo} title="Excluir o trecho (Delete)">
              🗑 Excluir
            </button>
            <button type="button" className="bt" disabled={travado || !t.podeDesfazer} onClick={t.desfazer} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
              ↶
            </button>
            <button type="button" className="bt" disabled={travado || !t.podeRefazer} onClick={t.refazer} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">
              ↷
            </button>
            <button type="button" className="bt" disabled={!podeEditar || removendoPausas} onClick={onRemoverPausas}>
              {removendoPausas ? "Procurando pausas…" : "〰 Remover pausas"}
            </button>
            <button type="button" className="bt" aria-label="Afastar" disabled={pxPorSegundo <= ZOOM.menor} onClick={() => mudarZoom(pxPorSegundo / ZOOM.passo)}>
              −
            </button>
            <button type="button" className="bt" aria-label="Aproximar" disabled={pxPorSegundo >= ZOOM.maior} onClick={() => mudarZoom(pxPorSegundo * ZOOM.passo)}>
              ＋
            </button>
          </div>
        )}
      </div>

      <section className="ec-tl">
        <div className="ec-cabecas" aria-hidden="true">
          <div>⏱</div>
          <div>V1</div>
          <div>A1</div>
        </div>
        <div
          className="ec-rolar"
          ref={rolar}
          onScroll={aoRolar}
          onPointerDownCapture={aoTocarNaTrilha}
          onPointerMoveCapture={aoMoverNaTrilha}
          onPointerUpCapture={aoSoltarDaTrilha}
          onPointerCancelCapture={aoSoltarDaTrilha}
        >
          <div className="ec-trilhas" ref={trilhas} style={{width: folga * 2 + total * escala + (celular ? 0 : 200)}}>
            <div className="ec-regua" onPointerDown={aoApertarAgulha} onPointerMove={aoArrastarAgulha}>
              {marcas.map((segundo) => {
                const grande = segundo % passo === 0;
                return (
                  <i key={segundo} className={grande ? "ec-marca-grande" : undefined} style={{left: folga + segundo * 1000 * escala}}>
                    {grande ? <span>{tempoCurto(segundo * 1000)}</span> : null}
                  </i>
                );
              })}
            </div>
            <div className={`ec-trilha${alvoDoSoltar ? " ec-trilha-alvo" : ""}`} data-vazio={vazio} {...trilhaComEventos}>
              {pronto ? lista.map((trecho, i) => clipe(trecho, i, "v")) : null}
            </div>
            <div className="ec-trilha ec-trilha-a" data-vazio={vazio ? "O áudio do vídeo aparece aqui" : undefined} {...trilhaComEventos}>
              {pronto ? lista.map((trecho, i) => clipe(trecho, i, "a")) : null}
            </div>
            {arrasto ? <div className="ec-marca-do-arrasto" style={{left: folga + marcaDoArrasto * escala}} /> : null}
            {celular || !pronto || lista.length === 0 ? null : (
              <div className="ec-agulha" style={{left: cursorMs * escala}}>
                <span className="ec-agulha-cabeca" onPointerDown={aoApertarAgulha} onPointerMove={aoArrastarAgulha} />
              </div>
            )}
          </div>
        </div>
        {celular ? <div className="ec-agulha ec-agulha-fixa" /> : null}
        {celular ? (
          <button type="button" className="ec-mais" aria-label="Adicionar vídeos" disabled={travado} onClick={onAbrirMidia}>
            +
          </button>
        ) : null}
      </section>

      {celular ? (
        <nav className="ec-barra-cel">
          <button type="button" disabled={!podeEditar} onClick={dividirNoCursor}>
            <b>✂</b>Dividir
          </button>
          <button type="button" disabled={!podeEditar || !alvo} onClick={excluirAlvo}>
            <b>🗑</b>Excluir
          </button>
          <button type="button" disabled={!podeEditar || removendoPausas} onClick={onRemoverPausas}>
            <b>〰</b>
            {removendoPausas ? "Procurando…" : "Pausas"}
          </button>
          <button type="button" disabled={travado || !t.podeDesfazer} onClick={t.desfazer}>
            <b>↶</b>Desfazer
          </button>
          <button type="button" disabled={travado || !t.podeRefazer} onClick={t.refazer}>
            <b>↷</b>Refazer
          </button>
        </nav>
      ) : null}
    </>
  );
};
