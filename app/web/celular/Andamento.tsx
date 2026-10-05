// Tarefa em andamento (importar, transcrever): uma faixa fina com o texto da etapa.
import type {Tarefa} from "../useEditor";

export const Andamento: React.FC<{tarefa?: Tarefa}> = ({tarefa}) =>
  tarefa ? (
    <div className="cel-andamento" role="status" aria-live="polite">
      <span>
        {tarefa.nome}: {tarefa.etapa}
        {tarefa.fracao !== undefined ? ` ${Math.round(tarefa.fracao * 100)}%` : ""}
      </span>
      <progress max={1} value={tarefa.fracao} />
    </div>
  ) : null;
