// Tentar de novo sozinho quando a falha é passageira: sem resposta do servidor (a
// conexão caiu) ou o servidor com problema (5xx). Recusa de verdade (4xx: arquivo
// inválido, limite do plano, já existe, muitos pedidos) não se repete.
const statusDe = (erro: unknown) => (erro as {status?: number} | null)?.status;
export const falhaPassageira = (erro: unknown) => {
  const status = statusDe(erro);
  return status === undefined || status >= 500;
};

export const comTentativas = async <T>(
  fazer: () => Promise<T>,
  tentativasAMais = 2,
  esperar = (vez: number) => new Promise((resolve) => setTimeout(resolve, 2000 * vez)),
): Promise<T> => {
  for (let vez = 1; ; vez++) {
    try {
      return await fazer();
    } catch (erro) {
      if (vez > tentativasAMais || !falhaPassageira(erro)) throw erro;
      await esperar(vez);
    }
  }
};
