// Plano da conta na tela: só textos. Quem decide o uso, o saldo e a marca d'água
// é o servidor (app/servidor/cota.ts); aqui só se mostra o que ele mandou.
import type {Conta, DecisaoDeExportacao, Plano, UsoDoPlano} from "../api";

export const CONFIG_CELULAR = {
  // Quadro do plano no Início (com login; no modo local não há plano).
  mostrarPlano: true,
};

// Nome de cada plano na tela (o valor salvo no perfil é a chave).
const NOMES_DOS_PLANOS: Record<Plano, string> = {gratis: "Grátis", assinante: "Assinante"};

// O plano da conta, lido do perfil (sem login: nenhum).
export const nomeDoPlano = (conta: Conta | null): string | undefined =>
  conta ? (NOMES_DOS_PLANOS[conta.plano] ?? conta.plano) : undefined;

// "2 min 05 s", "45 s" (para cima: o que aparece nunca é menos que o descontado).
export const duracaoEmTexto = (segundos: number): string => {
  const total = Math.ceil(Math.max(0, segundos));
  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return minutos > 0 ? `${minutos} min ${String(resto).padStart(2, "0")} s` : `${resto} s`;
};

// No horário de Brasília (o mês do plano vira à meia-noite de lá, não no fuso do aparelho).
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo"});

// Quadro do plano: título, detalhe e quanto da barra está cheio (0 a 1).
export const resumoDoUso = (uso: UsoDoPlano): {titulo: string; detalhe: string; fracao: number} => {
  if (uso.plano === "gratis") {
    const restantes = Math.max(0, uso.videosDoPlano - uso.videosUsados);
    return {
      titulo: `${uso.videosUsados} de ${uso.videosDoPlano} vídeo exportado`,
      detalhe: restantes > 0 ? "Grátis · sai com marca d'água" : "Grátis · assine para exportar mais",
      fracao: uso.videosUsados / Math.max(1, uso.videosDoPlano),
    };
  }
  const restante = Math.max(0, uso.segundosDoPlano - uso.segundosUsados);
  return {
    titulo: `${duracaoEmTexto(uso.segundosUsados)} usados · restam ${duracaoEmTexto(restante)}`,
    detalhe: `Assinante · ${Math.round(uso.segundosDoPlano / 60)} min por mês · renova em ${dataCurta(uso.renovaEm)}`,
    fracao: uso.segundosUsados / Math.max(1, uso.segundosDoPlano),
  };
};

// "2ª reexportação de 5 sem desconto" (a primeira exportação é a número 0).
const reexportacao = (decisao: DecisaoDeExportacao) => `${decisao.exportacoesDoProjeto}ª reexportação deste projeto (de 5 sem desconto)`;

// Antes de exportar: o que vai descontar e quanto sobra (a decisão é do servidor).
export const avisoDaExportacao = (decisao: DecisaoDeExportacao): string[] => {
  const linhas: string[] = [];
  if (decisao.uso.plano === "gratis") {
    linhas.push(
      decisao.descontoS > 0
        ? decisao.restanteDepois > 0
          ? `Vai usar 1 dos seus vídeos do plano grátis (sobram ${decisao.restanteDepois}).`
          : "Vai usar o seu vídeo do plano grátis (é o único)."
        : `${reexportacao(decisao)}: não desconta.`,
    );
    linhas.push("Sai com a marca d'água Ascent Legendas. Assinantes exportam sem marca.");
    return linhas;
  }
  linhas.push(
    decisao.descontoS > 0
      ? `Vai descontar ${duracaoEmTexto(decisao.descontoS)} do seu plano. Sobram ${duracaoEmTexto(decisao.restanteDepois)} neste mês.`
      : `${reexportacao(decisao)}: não desconta. Restam ${duracaoEmTexto(decisao.restanteDepois)} neste mês.`,
  );
  return linhas;
};
