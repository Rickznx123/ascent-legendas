// Plano da conta e configurações do layout de celular.
import type {Conta, Plano} from "../api";

export const CONFIG_CELULAR = {
  // Quadro de minutos do plano no Início. O plano já vem do perfil (Supabase), mas
  // os minutos usados só chegam na Etapa 2b (tabela exportacoes): fica desligado
  // até lá.
  mostrarPlano: false,
};

// Nome de cada plano na tela (o valor salvo no perfil é a chave).
const NOMES_DOS_PLANOS: Record<Plano, string> = {gratis: "Grátis", assinante: "Assinante"};

// O plano da conta, lido do perfil (sem login: nenhum).
export const nomeDoPlano = (conta: Conta | null): string | undefined =>
  conta ? (NOMES_DOS_PLANOS[conta.plano] ?? conta.plano) : undefined;

// Uso do plano no quadro do Início (minutos: Etapa 2b; por enquanto, nada vem preenchido).
export type UsoDoPlano = {
  minutosUsados: number;
  minutosDoPlano: number;
  renovaEmDias: number;
  nomeDoPlano: string;
};
