// Timeline dos cortes (PLANO-CORTES.md, Blocos 2 e 6), a mesma no computador e no
// celular: a prévia tocando só os trechos (nada é montado), a trilha e os botões.
// Eventos de ponteiro: tocar põe o cursor e escolhe o trecho; as bordas aparam;
// arrastar o trecho reordena (com o dedo: segurar e arrastar, porque arrastar direto
// rola a trilha); dois dedos fazem a pinça do zoom.
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {Player} from "@remotion/player";
import type {PlayerRef} from "@remotion/player";
import {AbsoluteFill, Html5Video, Series} from "remotion";
import {api, tituloDoVideo} from "./api";
import type {Catalogo, Trecho} from "./api";
import type {Salvamento} from "./BarraTopo";
import {usePreviaLeve} from "./previa-leve";
import {FPS, aparar, dividir, duracaoDe, duracaoTotal, excluir, fimDe, mover, msDoQuadro, noVideo, quadroDe, quadrosDe, removerPausas} from "./trechos";
import type {Duracoes} from "./trechos";

const ESPERA_PARA_SALVAR_MS = 800;
const MAXIMO_NO_HISTORICO = 100;
// Menos que isso é um toque, não um arrasto.
const ARRASTO_MINIMO_PX = 6;
const ZOOM_MAXIMO = 64;

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

type InfoDoVideo = {duracaoMs?: number; largura?: number; altura?: number; capa?: string; fonte?: string; erro?: string};

// Sem tela: lê a duração e acompanha a prévia leve (capa e endereço) de um vídeo.
const LerVideo: React.FC<{nome: string; onInfo: (nome: string, info: InfoDoVideo) => void}> = ({nome, onInfo}) => {
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

// ponteiro: o dedo (ou mouse) do gesto; um segundo dedo não mexe nele.
type Gesto =
  | {tipo: "aparar"; ponteiro: number; id: string; lado: "inicio" | "fim"; x0: number; ms0: number; base: Trecho[]}
  | {tipo: "trecho"; ponteiro: number; indice: number; x0: number; y0: number; arrastar: boolean};

// Com o dedo, segurar parado este tempo num trecho começa a reordenar.
const SEGURAR_PARA_ARRASTAR_MS = 350;

const segundos = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

export const Timeline: React.FC<{t: TimelineDoProjeto; catalogo: Catalogo; travado: boolean}> = ({t, catalogo, travado}) => {
  const {lista, mudar} = t;
  const [infos, setInfos] = useState<Record<string, InfoDoVideo>>({});
  const aoInfo = useCallback((nome: string, info: InfoDoVideo) => setInfos((atual) => ({...atual, [nome]: info})), []);
  const nomes = useMemo(() => [...new Set(lista.map((trecho) => trecho.video))], [lista]);
  const duracoes = useMemo(
    () => Object.fromEntries(Object.entries(infos).flatMap(([nome, info]) => (info.duracaoMs ? [[nome, info.duracaoMs]] : []))) as Duracoes,
    [infos],
  );
  const fontes = useMemo(() => Object.fromEntries(Object.entries(infos).map(([nome, info]) => [nome, info.fonte])), [infos]);
  const pronto = nomes.every((nome) => duracoes[nome]);
  const erroDeLeitura = nomes.map((nome) => infos[nome]?.erro).find(Boolean);
  const total = pronto ? duracaoTotal(lista, duracoes) : 0;

  // "Remover pausas": vira cortes comuns, um passo só no desfazer.
  const [pausas, setPausas] = useState<{procurando: boolean; aviso?: string}>({procurando: false});
  const removerAsPausas = () => {
    setPausas({procurando: true});
    api
      .pausas(t.id)
      .then(({pausas: encontradas}) => {
        const atual = conta.current.lista;
        const nova = removerPausas(atual, conta.current.duracoes, encontradas);
        if (nova !== atual) mudar(() => nova);
        setPausas({procurando: false, aviso: nova === atual ? "Nenhuma pausa para remover." : undefined});
      })
      .catch((erro: unknown) => setPausas({procurando: false, aviso: erro instanceof Error ? erro.message : String(erro)}));
  };

  const [cursorMs, setCursorMs] = useState(0);
  const [selecionado, setSelecionado] = useState<string>();
  const player = useRef<PlayerRef>(null);
  const conta = useRef({lista, duracoes});
  conta.current = {lista, duracoes};

  // Cursor acompanha a prévia; tocar na trilha leva a prévia ao ponto.
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const aoQuadro = ({detail}: {detail: {frame: number}}) => setCursorMs(msDoQuadro(conta.current.lista, conta.current.duracoes, detail.frame));
    p.addEventListener("frameupdate", aoQuadro);
    return () => p.removeEventListener("frameupdate", aoQuadro);
  }, [pronto, lista.length]);
  const irPara = (ms: number) => {
    const limitado = Math.min(Math.max(0, ms), Math.max(0, total - 1));
    setCursorMs(limitado);
    player.current?.seekTo(quadroDe(lista, duracoes, limitado));
  };

  const sobOCursor = pronto ? noVideo(lista, duracoes, cursorMs) : undefined;
  const alvo = lista.find((trecho) => trecho.id === selecionado) ?? (sobOCursor ? lista[sobOCursor.indice] : undefined);
  const dividirNoCursor = () => mudar((atual) => dividir(atual, duracoes, cursorMs));
  const excluirAlvo = () => {
    if (!alvo) return;
    mudar((atual) => excluir(atual, alvo.id));
    setSelecionado(undefined);
  };

  // Atalhos: S divide, Delete exclui, Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y). Na captura e
  // parando ali: o Ctrl+Z das legendas (useEditor) não pode desfazer nada desta tela.
  const atalhos = useRef({dividirNoCursor, excluirAlvo, desfazer: t.desfazer, refazer: t.refazer, ativo: pronto && !travado});
  atalhos.current = {dividirNoCursor, excluirAlvo, desfazer: t.desfazer, refazer: t.refazer, ativo: pronto && !travado};
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
        : undefined;
      if (!acao) return;
      event.preventDefault();
      event.stopPropagation();
      acao();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  // Escala: com zoom 1, a timeline inteira cabe na largura da trilha.
  const trilha = useRef<HTMLDivElement>(null);
  const faixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(600);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const elemento = trilha.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [pronto]);
  const escala = ((largura - 4) / Math.max(total, 1000)) * zoom;
  const msNoPonto = (clientX: number) => (clientX - (faixa.current?.getBoundingClientRect().left ?? 0)) / escala;
  // Zoom (botões ou pinça): o instante sob a âncora (x em px, dentro da trilha) fica no lugar.
  const ancora = useRef<{ms: number; x: number} | undefined>(undefined);
  const mudarZoom = (novo: number, x = (trilha.current?.clientWidth ?? 0) / 2) => {
    if (trilha.current) ancora.current = {ms: (trilha.current.scrollLeft + x) / escala, x};
    setZoom(Math.min(ZOOM_MAXIMO, Math.max(1, novo)));
  };
  useLayoutEffect(() => {
    const a = ancora.current;
    ancora.current = undefined;
    if (a && trilha.current) trilha.current.scrollLeft = a.ms * escala - a.x;
  }, [escala]);

  const comecos = lista.reduce<number[]>((soma, trecho, i) => [...soma, i === 0 ? 0 : soma[i - 1] + duracaoDe(lista[i - 1], duracoes)], []);
  const gesto = useRef<Gesto | undefined>(undefined);
  const [arrasto, setArrasto] = useState<{indice: number; dx: number; para: number}>();
  // Para onde vai um trecho arrastado: depois de todos os outros cujo meio ficou à esquerda.
  const destino = (indice: number, ms: number) => lista.filter((trecho, i) => i !== indice && comecos[i] + duracaoDe(trecho, duracoes) / 2 < ms).length;

  const segurar = useRef<number | undefined>(undefined);
  const pinca = useRef<{distancia: number; zoom: number} | undefined>(undefined);
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
    setSelecionado(trecho.id);
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
      setArrasto({indice: g.indice, dx, para: destino(g.indice, msNoPonto(event.clientX))});
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
      setSelecionado(lista[g.indice].id);
      irPara(msNoPonto(event.clientX));
    }
  };
  const aoCancelar = () => {
    window.clearTimeout(segurar.current);
    if (gesto.current?.tipo === "aparar") t.fimDoGesto();
    gesto.current = undefined;
    setArrasto(undefined);
  };

  // Pinça: dois dedos na trilha mudam o zoom (o que estava entre eles fica no lugar).
  const dedos = () => [...toques.current.values()];
  const aoTocarNaTrilha = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    toques.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (toques.current.size === 2) {
      aoCancelar();
      const [a, b] = dedos();
      pinca.current = {distancia: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom};
    }
  };
  const aoMoverNaTrilha = (event: React.PointerEvent) => {
    if (!toques.current.has(event.pointerId)) return;
    toques.current.set(event.pointerId, {x: event.clientX, y: event.clientY});
    const p = pinca.current;
    if (!p || toques.current.size < 2 || !trilha.current) return;
    const [a, b] = dedos();
    mudarZoom((p.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / p.distancia, (a.x + b.x) / 2 - trilha.current.getBoundingClientRect().left);
  };
  const aoSoltarDaTrilha = (event: React.PointerEvent) => {
    toques.current.delete(event.pointerId);
    if (toques.current.size < 2) pinca.current = undefined;
  };
  // Arrastando um trecho, aparando ou com dois dedos: a trilha (e a página) não rolam
  // nem dão zoom. Só um toque que ainda não começou a rolar pode ser cancelado assim.
  useEffect(() => {
    const elemento = trilha.current;
    if (!elemento) return;
    const aoArrastarODedo = (event: TouchEvent) => {
      const g = gesto.current;
      if (event.touches.length > 1 || pinca.current || g?.tipo === "aparar" || (g?.tipo === "trecho" && g.arrastar)) event.preventDefault();
    };
    elemento.addEventListener("touchmove", aoArrastarODedo, {passive: false});
    return () => elemento.removeEventListener("touchmove", aoArrastarODedo);
  }, [pronto]);

  if (lista.length === 0) return null;
  if (!pronto) return <p className={erroDeLeitura ? "login-erro" : "suave"}>{erroDeLeitura ?? "Lendo os vídeos…"}{nomes.map((nome) => <LerVideo key={nome} nome={nome} onInfo={aoInfo} />)}</p>;

  const primeiro = infos[lista[0].video];
  const marcaDoArrasto = arrasto ? lista.filter((_, i) => i !== arrasto.indice).slice(0, arrasto.para).reduce((soma, trecho) => soma + duracaoDe(trecho, duracoes), 0) : 0;
  return (
    <div className="tl">
      {nomes.map((nome) => (
        <LerVideo key={nome} nome={nome} onInfo={aoInfo} />
      ))}
      <div className="tl-previa">
        <Player
          ref={player}
          component={Sequencia}
          inputProps={{trechos: lista, duracoes, fontes}}
          durationInFrames={Math.max(1, quadrosDe(lista, duracoes).reduce((a, b) => a + b, 0))}
          fps={FPS}
          compositionWidth={primeiro?.largura ?? 1080}
          compositionHeight={primeiro?.altura ?? 1920}
          style={{width: "100%", height: "100%"}}
          controls
          acknowledgeRemotionLicense
        />
      </div>
      <div className="tl-botoes">
        <button type="button" className="bt" disabled={travado} onClick={dividirNoCursor} title="Dividir no cursor (S)">
          Dividir
        </button>
        <button type="button" className="bt" disabled={travado || !alvo} onClick={excluirAlvo} title="Excluir o trecho (Delete)">
          Excluir
        </button>
        <button type="button" className="bt" disabled={travado || !t.podeDesfazer} onClick={t.desfazer} title="Desfazer (Ctrl+Z)">
          Desfazer
        </button>
        <button type="button" className="bt" disabled={travado || !t.podeRefazer} onClick={t.refazer} title="Refazer (Ctrl+Shift+Z)">
          Refazer
        </button>
        <button type="button" className="bt" disabled={travado || pausas.procurando} onClick={removerAsPausas}>
          {pausas.procurando ? "Procurando pausas…" : "Remover pausas"}
        </button>
        <span className="tl-zoom">
          <button type="button" className="bt" aria-label="Afastar" disabled={zoom <= 1} onClick={() => mudarZoom(zoom / 2)}>
            −
          </button>
          <button type="button" className="bt" aria-label="Aproximar" disabled={zoom >= ZOOM_MAXIMO} onClick={() => mudarZoom(zoom * 2)}>
            ＋
          </button>
        </span>
        <span className="suave tl-tempo">
          {segundos(cursorMs)} / {segundos(total)} · {t.salvamento === "salvo" ? "Salvo" : t.salvamento === "erro" ? "Erro ao salvar" : "Salvando…"}
        </span>
      </div>
      {pausas.aviso ? <p className="suave">{pausas.aviso}</p> : null}
      <div
        className="tl-trilha"
        ref={trilha}
        onPointerDownCapture={aoTocarNaTrilha}
        onPointerMoveCapture={aoMoverNaTrilha}
        onPointerUpCapture={aoSoltarDaTrilha}
        onPointerCancelCapture={aoSoltarDaTrilha}
      >
        <div
          className="tl-faixa"
          ref={faixa}
          style={{width: total * escala}}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) irPara(msNoPonto(event.clientX));
          }}
        >
          {lista.map((trecho, i) => {
            const capa = infos[trecho.video]?.capa;
            return (
              <div
                key={trecho.id}
                className={`tl-trecho${trecho.id === alvo?.id ? " tl-alvo" : ""}${arrasto?.indice === i ? " tl-arrastado" : ""}`}
                style={{
                  left: comecos[i] * escala,
                  width: duracaoDe(trecho, duracoes) * escala,
                  backgroundImage: capa ? `url("${capa}")` : undefined,
                  transform: arrasto?.indice === i ? `translateX(${arrasto.dx}px)` : undefined,
                }}
                onPointerDown={(event) => aoApertarTrecho(event, i)}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoCancelar}
                // O toque longo do celular não abre o menu (ele começa o arrasto).
                onContextMenu={(event) => event.preventDefault()}
              >
                <span className="tl-borda tl-borda-inicio" aria-label="Aparar o começo" onPointerDown={(event) => aoApertarBorda(event, trecho, "inicio")} />
                <span className="tl-nome">
                  {i + 1}. {tituloDoVideo(catalogo, trecho.video)}
                </span>
                <span className="tl-borda tl-borda-fim" aria-label="Aparar o fim" onPointerDown={(event) => aoApertarBorda(event, trecho, "fim")} />
              </div>
            );
          })}
          {arrasto ? <div className="tl-marca" style={{left: marcaDoArrasto * escala}} /> : null}
          <div className="tl-cursor" style={{left: cursorMs * escala}} />
        </div>
      </div>
    </div>
  );
};
