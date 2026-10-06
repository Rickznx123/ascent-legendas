// Tarefas longas (exportar e transcrever) soltas do pedido HTTP: o celular pode ir
// para segundo plano, e a conexão cair, sem parar a tarefa. A tela pergunta o
// andamento e, ao voltar, retoma o acompanhamento ou recebe o resultado. Pedir de
// novo a mesma tarefa (mesmo tipo, conta e vídeo) em curso devolve a que existe.
// Guardadas na memória do servidor (no Bloco 6, os renders vão para o Supabase).
import {randomUUID} from "node:crypto";

export type TarefaSolta = {
  id: string;
  video: string;
  estado: "andamento" | "pronta" | "falhou";
  etapa?: string;
  fracao?: number;
  mensagem?: string;
  // A tela mostra uma tela própria (ex.: "assine" → Assine para continuar).
  codigo?: string;
  // O resultado da tarefa (ex.: caminho do vídeo exportado, projeto transcrito).
  [campo: string]: unknown;
};

export const tarefasSoltas = () => {
  const tarefas = new Map<string, TarefaSolta>();
  return {
    ler: (chave: string): TarefaSolta | undefined => tarefas.get(chave),
    emAndamento: (chave: string): TarefaSolta | undefined => {
      const tarefa = tarefas.get(chave);
      return tarefa?.estado === "andamento" ? tarefa : undefined;
    },
    // Começa a tarefa e devolve na hora (sem esperar terminar). executar recebe o
    // progresso e devolve os campos do resultado; terminar roda no fim, dê certo ou não.
    iniciar: (
      chave: string,
      video: string,
      executar: (progress: (etapa: string, fracao?: number) => void) => Promise<Record<string, unknown>>,
      terminar: () => void,
    ): TarefaSolta => {
      const tarefa: TarefaSolta = {id: randomUUID(), video, estado: "andamento", etapa: "Começando..."};
      tarefas.set(chave, tarefa);
      void executar((etapa, fracao) => Object.assign(tarefa, {etapa, fracao}))
        .then((resultado) => Object.assign(tarefa, resultado, {estado: "pronta"}))
        .catch((erro: unknown) =>
          Object.assign(tarefa, {
            estado: "falhou",
            mensagem: erro instanceof Error ? erro.message : String(erro),
            codigo: (erro as {codigo?: unknown}).codigo === undefined ? undefined : String((erro as {codigo?: unknown}).codigo),
          }),
        )
        .finally(terminar);
      return tarefa;
    },
  };
};
