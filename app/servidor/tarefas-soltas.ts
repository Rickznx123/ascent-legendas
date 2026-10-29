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

export const MENSAGEM_DE_TAREFA_PARADA = "Deu erro, tente de novo.";
// Esperando a vez na fila não é estar parado (a etapa começa com "Na fila").
const naFila = (tarefa: TarefaSolta) => Boolean(tarefa.etapa?.startsWith("Na fila"));

// paradaMaximaMs: tarefa fora da fila sem nenhum progresso por mais que isto é
// cancelada (o sinal de executar dispara, quem estava nela vê "Deu erro, tente de
// novo" e a vaga da fila é liberada por quem ouve o sinal). Sem: nunca cancela.
export const tarefasSoltas = ({paradaMaximaMs}: {paradaMaximaMs?: number} = {}) => {
  const tarefas = new Map<string, TarefaSolta>();
  // Interno: quando saiu da fila, o último progresso e o cancelamento.
  const controle = new Map<TarefaSolta, {comecou?: number; ultimo: number; cancelar: AbortController}>();

  // Cancela as paradas. Exportado (conferir) para o teste não esperar o relógio.
  const conferir = (agora = Date.now()) => {
    if (!paradaMaximaMs) return;
    for (const [tarefa, c] of controle) {
      if (tarefa.estado !== "andamento" || naFila(tarefa) || agora - c.ultimo <= paradaMaximaMs) continue;
      Object.assign(tarefa, {estado: "falhou", mensagem: MENSAGEM_DE_TAREFA_PARADA});
      console.log(`Tarefa ${tarefa.id.slice(0, 8)} (${tarefa.video}): parada há mais de ${Math.round(paradaMaximaMs / 60_000)} min em "${tarefa.etapa}"; cancelada.`);
      c.cancelar.abort(new Error(MENSAGEM_DE_TAREFA_PARADA));
      controle.delete(tarefa);
    }
  };
  if (paradaMaximaMs) setInterval(() => conferir(), 30_000).unref();

  return {
    ler: (chave: string): TarefaSolta | undefined => tarefas.get(chave),
    emAndamento: (chave: string): TarefaSolta | undefined => {
      const tarefa = tarefas.get(chave);
      return tarefa?.estado === "andamento" ? tarefa : undefined;
    },
    // Uma tarefa em andamento desta conta, de qualquer vídeo (as chaves começam com
    // "<conta>:"); uma por conta de cada vez.
    daConta: (conta: string): TarefaSolta | undefined =>
      [...tarefas.entries()].find(([chave, tarefa]) => chave.startsWith(`${conta}:`) && tarefa.estado === "andamento")?.[1],
    // Quanto falta, pela velocidade até agora, para a primeira das tarefas rodando
    // terminar (a vaga que vai abrir) e quanto dura uma inteira; sem como estimar: undefined.
    estimativa: (agora = Date.now()): {proximaMs: number; inteiraMs: number} | undefined => {
      const rodando = [...controle].flatMap(([tarefa, c]) =>
        tarefa.estado === "andamento" && c.comecou !== undefined && (tarefa.fracao ?? 0) >= 0.03
          ? [{passou: agora - c.comecou, fracao: Math.min(1, tarefa.fracao!)}]
          : [],
      );
      if (rodando.length === 0) return undefined;
      const inteiras = rodando.map(({passou, fracao}) => passou / fracao);
      return {
        proximaMs: Math.min(...rodando.map(({passou, fracao}) => (passou / fracao) * (1 - fracao))),
        inteiraMs: inteiras.reduce((soma, ms) => soma + ms, 0) / inteiras.length,
      };
    },
    conferir,
    // Começa a tarefa e devolve na hora (sem esperar terminar). executar recebe o
    // progresso e o sinal de cancelamento, e devolve os campos do resultado; terminar
    // roda no fim, dê certo ou não.
    iniciar: (
      chave: string,
      video: string,
      executar: (progress: (etapa: string, fracao?: number) => void, sinal: AbortSignal) => Promise<Record<string, unknown>>,
      terminar: () => void,
    ): TarefaSolta => {
      const tarefa: TarefaSolta = {id: randomUUID(), video, estado: "andamento", etapa: "Começando..."};
      tarefas.set(chave, tarefa);
      const c = {ultimo: Date.now(), cancelar: new AbortController()} as {comecou?: number; ultimo: number; cancelar: AbortController};
      controle.set(tarefa, c);
      const progress = (etapa: string, fracao?: number) => {
        if (tarefa.estado !== "andamento") return;
        Object.assign(tarefa, {etapa, fracao});
        c.ultimo = Date.now();
        if (c.comecou === undefined && !naFila(tarefa)) c.comecou = c.ultimo;
      };
      void executar(progress, c.cancelar.signal)
        .then((resultado) => tarefa.estado === "andamento" && Object.assign(tarefa, resultado, {estado: "pronta"}))
        .catch(
          (erro: unknown) =>
            tarefa.estado === "andamento" &&
            Object.assign(tarefa, {
              estado: "falhou",
              mensagem: erro instanceof Error ? erro.message : String(erro),
              codigo: (erro as {codigo?: unknown}).codigo === undefined ? undefined : String((erro as {codigo?: unknown}).codigo),
            }),
        )
        .finally(() => {
          controle.delete(tarefa);
          terminar();
        });
      return tarefa;
    },
  };
};
