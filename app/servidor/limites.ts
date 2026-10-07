// Limites de uso do servidor (Etapa 3, bloco 7):
//   - uma transcrição e uma exportação por conta de cada vez;
//   - fila geral: até 20 renders no Lambda e 3 transcrições ao mesmo tempo; acima
//     disso, "Na fila, posição N", e a tarefa segue sozinha quando abre vaga;
//   - pedidos por minuto, por conta (sem login, por endereço): 60 no geral e 10 nas
//     rotas que custam (transcrever, exportar e abrir um envio).
// A fila de renders fica na tabela renders (sobrevive a um reinício, veja renders.ts);
// a de transcrições, na memória (uma transcrição leva segundos).
// FILA_RENDERS e FILA_TRANSCRICOES (ambiente) trocam as vagas, para testes.
import type {NextFunction, Request, Response} from "express";

const doAmbiente = (nome: string, padrao: number) => {
  const valor = Number(process.env[nome]);
  return Number.isInteger(valor) && valor > 0 ? valor : padrao;
};

export const LIMITES_DE_USO = {
  rendersAoMesmoTempo: doAmbiente("FILA_RENDERS", 20),
  // 3 transcrições: cabe no plano Starter do Render (512 MB); cada uma extrai o áudio com o ffmpeg.
  transcricoesAoMesmoTempo: doAmbiente("FILA_TRANSCRICOES", 3),
  pedidosPorMinuto: 60,
  pedidosCarosPorMinuto: 10,
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
// Rotas que custam (WhisperX, Lambda, abrir um envio no S3).
const CARAS = [
  {metodo: "POST", rota: /^\/api\/transcrever$/u},
  {metodo: "POST", rota: /^\/api\/exportar$/u},
  {metodo: "POST", rota: /^\/api\/envio\/iniciar$/u},
];

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
    const cara = CARAS.some((item) => item.metodo === request.method && item.rota.test(rota));
    if (cara && !contar(`caro:${conta}`, LIMITES_DE_USO.pedidosCarosPorMinuto)) {
      response.status(429).json({mensagem: "Muitos pedidos seguidos de transcrição, exportação ou envio. Espere um minuto e tente de novo."});
      return;
    }
    if (!FORA_DO_LIMITE.some((padrao) => padrao.test(rota)) && !contar(`geral:${conta}`, LIMITES_DE_USO.pedidosPorMinuto)) {
      response.status(429).json({mensagem: "Muitos pedidos seguidos. Espere um minuto e tente de novo."});
      return;
    }
    next();
  };
};
