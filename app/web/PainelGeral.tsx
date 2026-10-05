import {useState} from "react";
import type {Posicao} from "../../src/posicao";
import type {AssignedCaptionBlock} from "../../src/types";
import {ControlesDePosicao} from "./ControlesDePosicao";
import {tempoDoBloco} from "./quadro";

type Props = {
  temProjeto: boolean;
  ocupado: boolean;
  // Sincronia das legendas em ms (positivo atrasa, negativo adianta).
  sincroniaMs: number;
  onSincronia: (valor: number) => void;
  posicao: Posicao;
  // Controles deslizantes da posição geral (o mesmo valor do arrasto na prévia).
  onInicioPosicao: () => void;
  onPosicao: (posicao: Posicao) => void;
  // Blocos excluídos (guardados no transcricao.json, podem ser restaurados).
  excluidos: AssignedCaptionBlock[];
  onRestaurar: (excluido: number) => void;
  blocosComPosicao: number;
  onRestaurarPosicoes: () => void;
  onRefazerLayouts: () => void;
  onRecarregar: () => void;
};

export const PainelGeral: React.FC<Props> = ({
  temProjeto,
  ocupado,
  sincroniaMs,
  onSincronia,
  posicao,
  onInicioPosicao,
  onPosicao,
  excluidos,
  onRestaurar,
  blocosComPosicao,
  onRestaurarPosicoes,
  onRefazerLayouts,
  onRecarregar,
}) => {
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  return (
    <>
      <div className="campo" title="Adianta (−) ou atrasa (+) todas as legendas e os efeitos sonoros">
        <label htmlFor="geral-sincronia">Sincronia (ms)</label>
        <input
          id="geral-sincronia"
          type="number"
          className="sel campo-numero"
          step={50}
          min={-2000}
          max={2000}
          value={sincroniaMs}
          disabled={ocupado || !temProjeto}
          onChange={(event) => {
            const valor = Number(event.target.value);
            if (Number.isFinite(valor)) {
              onSincronia(Math.max(-2000, Math.min(2000, Math.round(valor))));
            }
          }}
        />
      </div>
      <div className="campo" title="Também muda com as predefinições ou com Mover legenda, embaixo da prévia">
        <span className="rotulo">Posição geral</span>
        <span className="campo-direita">
          <span>
            {posicao.x}% × {posicao.y}%
          </span>
          <button
            type="button"
            className="bt bt-p"
            disabled={ocupado || !temProjeto || posicao.x === 50}
            title="Centro horizontal (a altura continua a mesma)"
            onClick={() => {
              onInicioPosicao();
              onPosicao({...posicao, x: 50});
            }}
          >
            Centralizar
          </button>
        </span>
      </div>
      <ControlesDePosicao
        id="geral-posicao"
        posicao={posicao}
        desativado={ocupado || !temProjeto}
        onInicio={onInicioPosicao}
        onMudar={onPosicao}
      />
      <div className="campo">
        <span className="rotulo">Blocos excluídos</span>
        <button
          type="button"
          className="bt bt-p"
          disabled={excluidos.length === 0}
          aria-pressed={mostrarExcluidos}
          onClick={() => setMostrarExcluidos(!mostrarExcluidos)}
        >
          {mostrarExcluidos ? "Esconder" : "Mostrar"} ({excluidos.length})
        </button>
      </div>
      {mostrarExcluidos && excluidos.length > 0 ? (
        <section className="excluidos" aria-label="Blocos excluídos">
          {excluidos.map((bloco, indice) => (
            <div key={`${bloco.startMs}-${indice}`} className="excluido">
              <span className="suave">{tempoDoBloco(bloco.startMs)}</span>
              <span className="excluido-texto">{bloco.words.map((palavra) => palavra.text).join(" ")}</span>
              <button type="button" className="bt bt-p" onClick={() => onRestaurar(indice)}>
                Restaurar
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <div className="acoes">
        <button
          type="button"
          className="bt"
          disabled={ocupado || blocosComPosicao === 0}
          title="Todos os blocos voltam para a posição geral"
          onClick={onRestaurarPosicoes}
        >
          Restaurar posições{blocosComPosicao > 0 ? ` (${blocosComPosicao})` : ""}
        </button>
        <button
          type="button"
          className="bt"
          disabled={!temProjeto}
          title="Escolhe de novo os layouts de todos os blocos"
          onClick={onRefazerLayouts}
        >
          Refazer layouts
        </button>
        <button type="button" className="bt" disabled={ocupado} onClick={onRecarregar} title="Relê as pastas templates/ e paletas/">
          Recarregar templates
        </button>
      </div>
    </>
  );
};
