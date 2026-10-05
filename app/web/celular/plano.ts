// Configurações do layout de celular.
export const CONFIG_CELULAR = {
  // Quadro de minutos do plano no Início. Depende do login, que ainda não existe:
  // fica desligado até lá.
  mostrarPlano: false,
};

// Uso do plano, quando o login existir (por enquanto, nada vem preenchido).
export type UsoDoPlano = {
  minutosUsados: number;
  minutosDoPlano: number;
  renovaEmDias: number;
  nomeDoPlano: string;
};
