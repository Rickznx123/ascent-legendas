import {MARGEM_SEGURA} from "../../src/posicao";
import type {Posicao} from "../../src/posicao";

// Mantém o ponto dentro da margem segura (a mesma regra do arrasto).
export const dentroDaMargem = (posicao: Posicao): Posicao => {
  const limitar = (valor: number, minimo: number, maximo: number) =>
    Math.round(Math.min(maximo, Math.max(minimo, valor)) * 10) / 10;
  return {
    x: limitar(posicao.x, MARGEM_SEGURA.xMin, MARGEM_SEGURA.xMax),
    y: limitar(posicao.y, MARGEM_SEGURA.yMin, MARGEM_SEGURA.yMax),
  };
};

// Dois controles deslizantes (Horizontal e Vertical, 0 a 100%) para uma posição.
// O valor mexido é o mesmo do arrasto na prévia, então os dois ficam sincronizados.
export const ControlesDePosicao: React.FC<{
  id: string;
  posicao: Posicao;
  desativado: boolean;
  // Começo de um ajuste (entra no histórico de desfazer uma vez só).
  onInicio: () => void;
  onMudar: (posicao: Posicao) => void;
}> = ({id, posicao, desativado, onInicio, onMudar}) => (
  <>
    {(
      [
        {eixo: "x", nome: "Horizontal"},
        {eixo: "y", nome: "Vertical"},
      ] as const
    ).map(({eixo, nome}) => (
      <div key={eixo} className="campo campo-deslizante">
        <label htmlFor={`${id}-${eixo}`}>{nome}</label>
        <input
          id={`${id}-${eixo}`}
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={posicao[eixo]}
          disabled={desativado}
          onPointerDown={onInicio}
          onKeyDown={(event) => {
            if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End" || event.key.startsWith("Page")) {
              onInicio();
            }
          }}
          onChange={(event) => onMudar(dentroDaMargem({...posicao, [eixo]: Number(event.target.value)}))}
        />
        <output htmlFor={`${id}-${eixo}`} className="valor-deslizante">
          {posicao[eixo]}%
        </output>
      </div>
    ))}
  </>
);
