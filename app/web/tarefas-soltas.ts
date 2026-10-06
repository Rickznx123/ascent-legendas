// Acompanhamento das tarefas longas que o servidor faz soltas da página (exportar e
// transcrever, veja app/servidor/tarefas-soltas.ts): pergunta o andamento a cada
// 1,5 s, parado enquanto a página está escondida (a tarefa segue no servidor).
// Cada tarefa terminada é marcada neste aparelho quando a tela mostra o resultado,
// para não aparecer de novo ao reabrir o projeto.
export type TarefaSolta = {
  id: string;
  video: string;
  estado: "andamento" | "pronta" | "falhou";
  etapa?: string;
  fracao?: number;
  mensagem?: string;
  codigo?: string;
};

const INTERVALO_MS = 1500;
const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Até a tarefa terminar (pronta ou falhou). Erro: ela sumiu do servidor (reiniciou
// no meio) ou foi trocada por outra do mesmo vídeo.
export const acompanharTarefa = async <T extends TarefaSolta>(
  inicial: T,
  ler: () => Promise<T | {estado: "nenhuma"}>,
  onAndamento: (tarefa: T) => void,
): Promise<T> => {
  let atual = inicial;
  while (atual.estado === "andamento") {
    onAndamento(atual);
    await esperar(INTERVALO_MS);
    while (document.visibilityState === "hidden") {
      await esperar(1000);
    }
    const lida = await ler().catch(() => atual);
    if (lida.estado === "nenhuma" || (lida as T).id !== inicial.id) {
      throw new Error("A tarefa foi interrompida no servidor. Tente de novo.");
    }
    atual = lida as T;
  }
  return atual;
};

export const tarefaJaMostrada = (id: string): boolean => {
  try {
    return localStorage.getItem(`tarefa-vista:${id}`) !== null;
  } catch {
    return false;
  }
};

export const marcarTarefaMostrada = (id: string) => {
  try {
    localStorage.setItem(`tarefa-vista:${id}`, "1");
  } catch {
    // Sem armazenamento: no pior caso, o resultado aparece de novo.
  }
};
