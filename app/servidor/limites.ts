// Limites de uso do servidor (Etapa 3, bloco 7):
//   - uma transcrição e uma exportação por conta de cada vez;
//   - fila geral: até 20 renders no Lambda e 3 transcrições ao mesmo tempo; acima
//     disso, "Na fila, posição N", e a tarefa segue sozinha quando abre vaga;
//   - o que pesa no próprio servidor (ffmpeg): 1 prévia leve e 2 sons tocados ao
//     mesmo tempo, para caber em 1 CPU / 2 GB (medido com scripts/medir-carga.ts);
//   - pedidos por minuto, por conta (sem login, por endereço): 300 no geral, 10 nas
//     rotas que custam (transcrever, exportar e abrir um envio) e os eventos do funil
//     num balde só deles.
// A fila de renders fica na tabela renders (sobrevive a um reinício, veja renders.ts);
// a de transcrições, na memória (uma transcrição leva segundos).
// FILA_RENDERS, FILA_TRANSCRICOES, FILA_PREVIAS, FILA_SONS e FILA_MONTAGENS (ambiente) trocam as vagas.
import type {NextFunction, Request, Response} from "express";

const doAmbiente = (nome: string, padrao: number) => {
  const valor = Number(process.env[nome]);
  return Number.isInteger(valor) && valor > 0 ? valor : padrao;
};

export const LIMITES_DE_USO = {
  rendersAoMesmoTempo: doAmbiente("FILA_RENDERS", 20),
  // 3 transcrições: cada uma extrai o áudio com o ffmpeg (segundos) e espera o WhisperX.
  transcricoesAoMesmoTempo: doAmbiente("FILA_TRANSCRICOES", 3),
  // Prévia leve (H.264 do vídeo inteiro): a etapa mais pesada, ocupa a CPU toda.
  previasAoMesmoTempo: doAmbiente("FILA_PREVIAS", 1),
  // Sons tocados da prévia do editor (um ffmpeg curto por som).
  sonsAoMesmoTempo: doAmbiente("FILA_SONS", 2),
  // Montagem do vídeo dos cortes (projetos.ts): converte o vídeo inteiro, como a prévia leve.
  montagensAoMesmoTempo: doAmbiente("FILA_MONTAGENS", 1),
  // 300: ir e voltar entre Início, projeto e editor já faz ~20 leituras baratas
  // (com 60, o uso normal recebia "Muitos pedidos seguidos"). Só barra script.
  pedidosPorMinuto: 300,
  pedidosCarosPorMinuto: 10,
  // Aberturas de envio: limite próprio, para vários vídeos de uma vez (a mídia de um
  // projeto, com as tentativas de novo) não esbarrarem no das transcrições e exportações.
  enviosPorMinuto: 30,
  eventosPorMinuto: 120,
};

// O que a tela mostra enquanto espera a vez (começa com "Na fila": a tela reconhece).
// Sem dados de outra conta: só que há outro vídeo na frente e, se der para estimar, o tempo.
export const textoDaFila = (posicao: number, esperaMs?: number): string =>
  `Na fila (posição ${Math.max(1, posicao)}): aguardando outro vídeo terminar` +
  (esperaMs === undefined ? "" : ` · cerca de ${Math.max(1, Math.ceil(esperaMs / 60_000))} min`);

// Espera a vez avisando a posição e a estimativa (refeita a cada 10 s: a posição
// pode não mudar por minutos). Cancelada (sinal), a vaga é devolvida na hora, mesmo
// que o trabalho travado não pare: a fila não fica presa.
export const entrarComAviso = async (
  fila: {entrar: (aoMudar?: (posicao: number) => void) => Promise<() => void>},
  progress: (etapa: string, fracao?: number) => void,
  estimativa: () => {proximaMs: number; inteiraMs: number} | undefined,
  sinal?: AbortSignal,
): Promise<() => void> => {
  let posicao = 0;
  const avisar = () => {
    if (posicao === 0) return;
    const e = estimativa();
    progress(textoDaFila(posicao, e && e.proximaMs + (posicao - 1) * e.inteiraMs), 0);
  };
  const relogio = setInterval(avisar, 10_000);
  try {
    const liberar = await fila.entrar((nova) => {
      posicao = nova;
      avisar();
    });
    sinal?.addEventListener("abort", liberar, {once: true});
    return liberar;
  } finally {
    clearInterval(relogio);
  }
};

// Fila com vagas (a primeira a chegar é a primeira a sair). entrar() espera a vez e
// devolve a função que libera a vaga; aoMudar recebe a posição na fila (1 = a
// próxima) enquanto espera.
export const filaComVagas = (vagas: number) => {
  let ocupadas = 0;
  const esperando: {seguir: () => void; aoMudar: (posicao: number) => void}[] = [];
  const avisar = () => esperando.forEach((item, indice) => item.aoMudar(indice + 1));
  const liberar = () => {
    ocupadas--;
    const proximo = esperando.shift();
    if (proximo) {
      ocupadas++;
      proximo.seguir();
    }
    avisar();
  };
  return {
    entrar: (aoMudar: (posicao: number) => void = () => undefined): Promise<() => void> =>
      new Promise((resolve) => {
        let liberada = false;
        const soltar = () => {
          if (!liberada) {
            liberada = true;
            liberar();
          }
        };
        if (ocupadas < vagas) {
          ocupadas++;
          resolve(soltar);
          return;
        }
        esperando.push({seguir: () => resolve(soltar), aoMudar});
        aoMudar(esperando.length);
      }),
    ocupadas: () => ocupadas,
    esperando: () => esperando.length,
  };
};

// Rotas de consulta frequente (a tela pergunta o andamento a cada poucos segundos e
// o envio assina as partes em lotes): não contam no limite geral.
const FORA_DO_LIMITE = [/^\/api\/exportacao$/u, /^\/api\/transcricao$/u, /^\/api\/previa$/u, /^\/api\/envio\/(assinar|partes)$/u];
// Eventos do funil (a tela manda e ignora a resposta): passando do limite, são
// descartados em silêncio, sem gastar o limite geral.
const EVENTOS = /^\/api\/eventos(\/visitante)?$/u;
// Rotas que custam (WhisperX, Lambda).
const CARAS = [
  {metodo: "POST", rota: /^\/api\/transcrever$/u},
  {metodo: "POST", rota: /^\/api\/exportar$/u},
];
// Abrir um envio no S3: conta à parte (enviosPorMinuto).
const ABERTURA_DE_ENVIO = /^\/api\/envio\/iniciar$/u;

// Limite de pedidos por minuto (janela deslizante), por conta. Vai depois da
// autenticação (usa a conta do pedido; sem login, o endereço).
export const limiteDePedidos = (contaDo: (request: Request, response: Response) => string) => {
  const vistos = new Map<string, number[]>();
  const MINUTO = 60_000;
  const contar = (chave: string, maximo: number): boolean => {
    const agora = Date.now();
    const recentes = (vistos.get(chave) ?? []).filter((quando) => agora - quando < MINUTO);
    if (recentes.length >= maximo) {
      vistos.set(chave, recentes);
      return false;
    }
    recentes.push(agora);
    vistos.set(chave, recentes);
    return true;
  };
  // Limpa as contas paradas de vez em quando (memória).
  setInterval(() => {
    const agora = Date.now();
    for (const [chave, lista] of vistos) {
      if (lista.every((quando) => agora - quando >= MINUTO)) vistos.delete(chave);
    }
  }, 5 * MINUTO).unref();

  return (request: Request, response: Response, next: NextFunction) => {
    const rota = request.baseUrl + request.path;
    const conta = contaDo(request, response);
    if (EVENTOS.test(rota)) {
      if (contar(`eventos:${conta}`, LIMITES_DE_USO.eventosPorMinuto)) next();
      else response.status(204).end();
      return;
    }
    const cara = CARAS.some((item) => item.metodo === request.method && item.rota.test(rota));
    if (request.method === "POST" && ABERTURA_DE_ENVIO.test(rota) && !contar(`envio:${conta}`, LIMITES_DE_USO.enviosPorMinuto)) {
      response.status(429).json({mensagem: "Muitos vídeos enviados seguidos. Espere um minuto e tente de novo."});
      return;
    }
    if (cara && !contar(`caro:${conta}`, LIMITES_DE_USO.pedidosCarosPorMinuto)) {
      response.status(429).json({mensagem: "Muitos pedidos seguidos de transcrição ou exportação. Espere um minuto e tente de novo."});
      return;
    }
    if (!FORA_DO_LIMITE.some((padrao) => padrao.test(rota)) && !contar(`geral:${conta}`, LIMITES_DE_USO.pedidosPorMinuto)) {
      response.status(429).json({mensagem: "Muitos pedidos seguidos. Espere um minuto e tente de novo."});
      return;
    }
    next();
  };
};
