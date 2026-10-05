// Arrastar a legenda com o dedo direto na prévia do celular. Uma alça invisível fica
// sobre a área da legenda (em volta da posição atual); só ela recebe o toque, com
// touch-action: none, então a página não rola junto. O resto da prévia continua
// tocando/pausando. Um toque na alça sem arrastar também toca/pausa.
import {useRef, useState} from "react";
import {MARGEM_SEGURA} from "../../../src/posicao";
import type {Posicao} from "../../../src/posicao";

// Quanto o dedo anda (px) até virar arrasto (menos que isso é um toque).
const LIMIAR_DO_ARRASTO = 6;

type Toque = {id: number; x: number; y: number; posicao: Posicao; arrastou: boolean};

export const ArrastoCelular: React.FC<{
  // Largura / altura do vídeo: a camada tem a mesma caixa que a prévia.
  proporcao: number;
  posicao: Posicao;
  // O que o arrasto move ("Todas as legendas", "Bloco #4").
  rotulo: string;
  // Folha do bloco aberta: a área da legenda fica marcada.
  marcada: boolean;
  // Começo de um arrasto (entra no desfazer uma vez só).
  onInicio: () => void;
  onMover: (posicao: Posicao) => void;
  onToque: () => void;
}> = ({proporcao, posicao, rotulo, marcada, onInicio, onMover, onToque}) => {
  const camada = useRef<HTMLDivElement>(null);
  const toque = useRef<Toque | undefined>(undefined);
  const [arrastando, setArrastando] = useState(false);

  const soltar = (tocou: boolean) => {
    const atual = toque.current;
    toque.current = undefined;
    setArrastando(false);
    if (tocou && atual && !atual.arrastou) {
      onToque();
    }
  };

  return (
    <div
      ref={camada}
      className={`cel-arrasto ${arrastando ? "cel-arrasto-ativo" : ""}`}
      style={{["--proporcao" as string]: proporcao}}
    >
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
          <span className="cel-arrasto-rotulo">
            {rotulo} · {posicao.x}% × {posicao.y}%
          </span>
        </>
      ) : null}
      <div
        className={`cel-alca-legenda ${marcada ? "cel-alca-marcada" : ""}`}
        style={{left: `${posicao.x}%`, top: `${posicao.y}%`}}
        role="application"
        aria-label={`Arraste para mover: ${rotulo}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || toque.current) {
            return;
          }
          // Sem seleção de texto, sem cliques de compatibilidade (o toque é tratado aqui).
          event.preventDefault();
          toque.current = {id: event.pointerId, x: event.clientX, y: event.clientY, posicao, arrastou: false};
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Sem captura, o arrasto segue enquanto o dedo estiver sobre a alça.
          }
        }}
        onPointerMove={(event) => {
          const atual = toque.current;
          const caixa = camada.current?.getBoundingClientRect();
          if (!atual || atual.id !== event.pointerId || !caixa) {
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
            onInicio();
          }
          onMover({
            x: atual.posicao.x + (dx / caixa.width) * 100,
            y: atual.posicao.y + (dy / caixa.height) * 100,
          });
        }}
        onPointerUp={() => soltar(true)}
        onPointerCancel={() => soltar(false)}
        onLostPointerCapture={() => toque.current && soltar(false)}
      />
    </div>
  );
};
