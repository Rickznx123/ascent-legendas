// Caixa de tamanho da legenda, como no CapCut, no computador e no celular. A camada
// fica sobre a prévia e acompanha o bloco que está na tela (o [data-legenda] do
// Posicionado, src/KineticCaptionVideo.tsx). Tocar no bloco seleciona e mostra a caixa;
// arrastar dentro dela move; puxar um canto muda o tamanho em volta do centro; − e +
// mudam de 5 em 5%. Tocar no bloco já selecionado toca/pausa; tocar fora tira a seleção
// (e a prévia recebe o toque, como sempre).
import {useEffect, useRef, useState} from "react";
import {ESCALA_MAX, ESCALA_MIN, MARGEM_SEGURA, escalaLimitada, posicaoArrastada, posicaoDoBloco} from "../../src/posicao";
import type {Posicao} from "../../src/posicao";
import type {Editor} from "./useEditor";

// Quanto o ponteiro anda (px) até virar arrasto (menos que isso é um toque).
const LIMIAR_DO_ARRASTO = 6;
const PASSO_DOS_BOTOES = 0.05;

type Caixa = {left: number; top: number; width: number; height: number};
type Gesto =
  | {tipo: "mover"; id: number; x: number; y: number; posicao: Posicao; arrastou: boolean}
  | {tipo: "tamanho"; id: number; cx: number; cy: number; distancia: number; escala: number; maximo: number};

// Caixa do bloco na tela, em % da camada (o último [data-legenda]: o que está entrando).
const caixaDoBloco = (camada: HTMLElement): Caixa | undefined => {
  const blocos = document.querySelectorAll<HTMLElement>(".previa [data-legenda]");
  const bloco = blocos[blocos.length - 1];
  const fora = camada.getBoundingClientRect();
  if (!bloco || fora.width === 0) {
    return undefined;
  }
  const r = bloco.getBoundingClientRect();
  return {
    left: ((r.left - fora.left) / fora.width) * 100,
    top: ((r.top - fora.top) / fora.height) * 100,
    width: (r.width / fora.width) * 100,
    height: (r.height / fora.height) * 100,
  };
};

const mesmaCaixa = (a: Caixa | undefined, b: Caixa | undefined) =>
  a === b || (a !== undefined && b !== undefined && (["left", "top", "width", "height"] as const).every((k) => Math.abs(a[k] - b[k]) < 0.05));

export const CaixaDaLegenda: React.FC<{
  className?: string;
  // O que a caixa muda ("Todas as legendas", "Bloco #4"), a posição e o tamanho atuais.
  rotulo: string;
  posicao: Posicao;
  escala: number;
  // Mostra a caixa mesmo sem toque (ex.: folha do bloco aberta no celular).
  marcada?: boolean;
  // Começo de um arrasto ou de uma troca de tamanho (entra no desfazer uma vez só).
  onInicio: () => void;
  onMover: (posicao: Posicao) => void;
  onEscala: (escala: number) => void;
  // Volta ao padrão (o bloco igual aos outros, ou o geral em 100%); sem valor, não aparece.
  padrao?: {rotulo: string; onUsar: () => void};
  // Mudando todas as legendas: passa a mudar só o bloco da tela (sem valor, não aparece).
  onSoEsteBloco?: () => void;
  onToque?: () => void;
}> = ({className = "", rotulo, posicao, escala, marcada = false, onInicio, onMover, onEscala, padrao, onSoEsteBloco, onToque}) => {
  const camada = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto | undefined>(undefined);
  const [caixa, setCaixa] = useState<Caixa>();
  const [selecionada, setSelecionada] = useState(false);
  const [arrastando, setArrastando] = useState(false);

  // Acompanha o bloco a cada quadro (ele anda, entra, sai e muda de tamanho).
  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      const atual = camada.current ? caixaDoBloco(camada.current) : undefined;
      setCaixa((antes) => (mesmaCaixa(antes, atual) ? antes : atual));
      quadro = requestAnimationFrame(medir);
    };
    quadro = requestAnimationFrame(medir);
    return () => cancelAnimationFrame(quadro);
  }, []);

  // Tocar fora da caixa tira a seleção.
  useEffect(() => {
    if (!selecionada) {
      return;
    }
    const fora = (event: PointerEvent) => {
      if (!(event.target instanceof Node && camada.current?.contains(event.target))) {
        setSelecionada(false);
      }
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [selecionada]);

  const capturar = (event: React.PointerEvent) => {
    // Sem seleção de texto nem arrasto nativo do navegador no meio do caminho.
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Sem captura, o gesto segue enquanto o ponteiro estiver sobre a caixa.
    }
  };

  const soltar = (tocou: boolean) => {
    const atual = gesto.current;
    gesto.current = undefined;
    setArrastando(false);
    if (tocou && atual?.tipo === "mover" && !atual.arrastou) {
      if (selecionada) {
        onToque?.();
      } else {
        setSelecionada(true);
      }
    }
  };

  const mover = (event: React.PointerEvent) => {
    const atual = gesto.current;
    const fora = camada.current?.getBoundingClientRect();
    if (!atual || atual.id !== event.pointerId || !fora) {
      return;
    }
    // O "soltar" se perdeu (botão solto fora da janela): o gesto acaba aqui.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      soltar(false);
      return;
    }
    if (atual.tipo === "tamanho") {
      onEscala(Math.min(atual.maximo, escalaLimitada((atual.escala * Math.hypot(event.clientX - atual.cx, event.clientY - atual.cy)) / atual.distancia)));
      return;
    }
    const dx = event.clientX - atual.x;
    const dy = event.clientY - atual.y;
    if (!atual.arrastou) {
      if (Math.hypot(dx, dy) < LIMIAR_DO_ARRASTO) {
        return;
      }
      atual.arrastou = true;
      setArrastando(true);
      setSelecionada(true);
      onInicio();
    }
    onMover({x: atual.posicao.x + (dx / fora.width) * 100, y: atual.posicao.y + (dy / fora.height) * 100});
  };

  // A caixa medida no tamanho atual diz até onde dá para aumentar dentro da margem
  // segura (o render limita igual, veja escalaQueCabe): a porcentagem mostrada é a real.
  // No arrasto do canto, medido uma vez no começo (a medida chega um quadro depois).
  const maximoQueCabe = caixa
    ? Math.floor(
        Math.max(escala, escala * Math.min((MARGEM_SEGURA.xMax - MARGEM_SEGURA.xMin) / caixa.width, (MARGEM_SEGURA.yMax - MARGEM_SEGURA.yMin) / caixa.height)) * 100,
      ) / 100
    : ESCALA_MAX;
  const passo = (delta: number) => {
    onInicio();
    const valor = escalaLimitada(escala + delta);
    onEscala(valor > escala ? Math.min(valor, maximoQueCabe) : valor);
  };

  const visivel = selecionada || marcada || arrastando;
  const porcentagem = Math.round(escala * 100);

  return (
    <div ref={camada} className={`caixa-legenda ${className} ${arrastando ? "caixa-arrastando" : ""}`}>
      {arrastando ? (
        <>
          <div
            className="guia-margem"
            style={{
              left: `${MARGEM_SEGURA.xMin}%`,
              right: `${100 - MARGEM_SEGURA.xMax}%`,
              top: `${MARGEM_SEGURA.yMin}%`,
              bottom: `${100 - MARGEM_SEGURA.yMax}%`,
            }}
          />
          <div className={`guia-vertical ${posicao.x === 50 ? "guia-encaixada" : ""}`} />
          <div className="guia-horizontal" />
        </>
      ) : null}
      {caixa ? (
        <div
          className={`caixa-bloco ${visivel ? "caixa-visivel" : ""}`}
          style={{left: `${caixa.left}%`, top: `${caixa.top}%`, width: `${caixa.width}%`, height: `${caixa.height}%`}}
          role="application"
          aria-label={`${rotulo}: arraste para mover, puxe um canto para mudar o tamanho`}
          onPointerDown={(event) => {
            if (event.button !== 0 || gesto.current) {
              return;
            }
            capturar(event);
            gesto.current = {tipo: "mover", id: event.pointerId, x: event.clientX, y: event.clientY, posicao, arrastou: false};
          }}
          onPointerMove={mover}
          onPointerUp={() => soltar(true)}
          onPointerCancel={() => soltar(false)}
          onLostPointerCapture={() => gesto.current && soltar(false)}
        >
          {visivel
            ? (["nw", "ne", "sw", "se"] as const).map((canto) => (
                <span
                  key={canto}
                  className={`caixa-canto caixa-${canto}`}
                  aria-hidden="true"
                  onPointerDown={(event) => {
                    if (event.button !== 0 || gesto.current) {
                      return;
                    }
                    event.stopPropagation();
                    capturar(event);
                    const r = event.currentTarget.parentElement!.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    gesto.current = {tipo: "tamanho", id: event.pointerId, cx, cy, distancia: Math.max(1, Math.hypot(event.clientX - cx, event.clientY - cy)), escala, maximo: Math.max(escala, maximoQueCabe)};
                    setArrastando(true);
                    onInicio();
                  }}
                  onPointerMove={mover}
                  onPointerUp={() => soltar(false)}
                  onPointerCancel={() => soltar(false)}
                  onLostPointerCapture={() => gesto.current && soltar(false)}
                />
              ))
            : null}
        </div>
      ) : null}
      {visivel ? (
        // Bloco na metade de cima: a barra vai para baixo, para não cobrir o bloco.
        <div className={`caixa-barra ${caixa && caixa.top + caixa.height / 2 < 50 ? "caixa-barra-embaixo" : ""}`}>
          <span>
            {rotulo} · {porcentagem}%
          </span>
          <button type="button" aria-label="Diminuir a legenda" disabled={escala <= ESCALA_MIN} onClick={() => passo(-PASSO_DOS_BOTOES)}>
            −
          </button>
          <button type="button" aria-label="Aumentar a legenda" disabled={escala >= Math.min(ESCALA_MAX, maximoQueCabe)} onClick={() => passo(PASSO_DOS_BOTOES)}>
            +
          </button>
          {padrao ? (
            <button
              type="button"
              className="caixa-texto"
              onClick={() => {
                onInicio();
                padrao.onUsar();
              }}
            >
              {padrao.rotulo}
            </button>
          ) : null}
          {onSoEsteBloco ? (
            <button type="button" className="caixa-texto" onClick={onSoEsteBloco}>
              Só este bloco
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

// Props da caixa para o alvo do editor (um bloco, ou -1 para todas as legendas).
export const caixaDoEditor = (e: Editor, alvo: number, onSoEsteBloco: () => void) => {
  const bloco = e.blocos[alvo];
  const escala = e.escalaDe(alvo);
  return {
    rotulo: bloco ? `Bloco #${alvo + 1}` : "Todas as legendas",
    posicao: bloco
      ? posicaoDoBloco(bloco.posicao, e.projetoDoVideo?.posicao, e.estilo?.templates[bloco.template]?.posicao)
      : e.posicaoGeral,
    escala,
    padrao: bloco
      ? bloco.escala !== undefined
        ? {rotulo: "Igual às outras", onUsar: () => e.mudarEscala(alvo, undefined)}
        : undefined
      : escala !== 1
        ? {rotulo: "100%", onUsar: () => e.mudarEscala(-1, undefined)}
        : undefined,
    onInicio: e.inicioDeAjuste,
    onMover: (p: Posicao) => e.moverPosicao(alvo, posicaoArrastada(p)),
    onEscala: (valor: number) => e.mudarEscala(alvo, valor),
    onSoEsteBloco: !bloco && e.blocos[e.blocoAtivo] ? onSoEsteBloco : undefined,
  };
};

// Alvo da caixa: o bloco da tela se ele está aberto (selecionado) ou já tem posição ou
// tamanho próprios; senão, todas as legendas (-1).
export const alvoDaCaixa = (e: Editor, aberto: boolean): number => {
  const naTela = e.blocos[e.blocoAtivo];
  return naTela && (aberto || naTela.posicao || naTela.escala !== undefined) ? e.blocoAtivo : -1;
};
