// Limites dos planos (Etapa 2b). Tudo decidido aqui, no servidor; a tela só mostra.
//   Grátis: 1 vídeo exportado, com marca d'água. Depois, exportar fica bloqueado
//   ("Assine para continuar").
//   Assinante: 30 minutos exportados por mês, sem marca d'água. Pela assinatura
//   (Etapa 2c), por ciclo: do dia do pagamento até a próxima cobrança. Pelo npm run
//   plano (testadores), por mês do calendário, no horário de Brasília.
// Contagem: a duração do vídeo, na primeira exportação de cada projeto. As 5
// reexportações seguintes do mesmo projeto não descontam; da sexta em diante, cada
// uma desconta de novo. Só desconta o que terminou: o registro é gravado depois do
// render (e o que foi descontado fica gravado em descontado_s).
// Transcrições (Etapa 3, bloco 5): grátis, 3 por dia; assinante, 10. O dia vira à
// meia-noite de Brasília. Só contam as que terminaram ("Recomeçar do zero" conta;
// a detecção de voz sozinha, não).
import type {Plano} from "./contas";

export const LIMITES = {
  videosNoGratis: 1,
  segundosPorMesNoAssinante: 30 * 60,
  reexportacoesSemDesconto: 5,
  transcricoesPorDia: {gratis: 3, assinante: 10} satisfies Record<Plano, number>,
  // Envio de vídeo (Etapa 3): tamanho e duração máximos de cada arquivo.
  envio: {
    gratis: {bytes: 300 * 1024 * 1024, segundos: 2 * 60},
    assinante: {bytes: 1024 * 1024 * 1024, segundos: 10 * 60},
  } satisfies Record<Plano, {bytes: number; segundos: number}>,
};

// Brasília (sem horário de verão desde 2019).
const FUSO_HORAS = -3;

export type RegistroDeExportacao = {
  projeto_id: string | null;
  duracao_s: number;
  descontado_s: number;
  criado_em: string;
};

// Transcrições de hoje (dia de Brasília) e quando o dia vira.
export type UsoDeTranscricoes = {usadas: number; doPlano: number; renovaEm: string};

// Uso do plano para a tela (quadro do Início, menu da conta).
export type UsoDoPlano = (
  | {plano: "gratis"; comMarca: true; videosUsados: number; videosDoPlano: number}
  | {plano: "assinante"; comMarca: false; segundosUsados: number; segundosDoPlano: number; renovaEm: string}
) & {transcricoes?: UsoDeTranscricoes};

// O que uma exportação vai fazer, ou por que não pode.
export type DecisaoDeExportacao = {
  permitido: boolean;
  // Por que não pode: "assine" (grátis sem vídeos) ou "sem-saldo" (assinante).
  codigo?: "assine" | "sem-saldo";
  motivo?: string;
  comMarca: boolean;
  // Quanto esta exportação desconta (0 numa reexportação sem desconto).
  descontoS: number;
  // Quantas vezes este projeto já foi exportado.
  exportacoesDoProjeto: number;
  uso: UsoDoPlano;
  // Depois desta exportação (assinante: segundos; grátis: vídeos).
  restanteDepois: number;
};

// Início do mês de agora e do seguinte, no horário de Brasília (em UTC).
export const mesDoCalendario = (agora: Date): {inicio: Date; fim: Date} => {
  const local = new Date(agora.getTime() + FUSO_HORAS * 3600_000);
  const ano = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  const emUtc = (a: number, m: number) => new Date(Date.UTC(a, m, 1) - FUSO_HORAS * 3600_000);
  return {inicio: emUtc(ano, mes), fim: emUtc(ano, mes + 1)};
};

// Começo do dia de agora e do seguinte, no horário de Brasília (em UTC).
export const diaDoCalendario = (agora: Date): {inicio: Date; fim: Date} => {
  const local = new Date(agora.getTime() + FUSO_HORAS * 3600_000);
  const inicio = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - FUSO_HORAS * 3600_000);
  return {inicio, fim: new Date(inicio.getTime() + 24 * 3600_000)};
};

export const usoDeTranscricoes = (plano: Plano, usadasHoje: number, agora: Date): UsoDeTranscricoes => ({
  usadas: usadasHoje,
  doPlano: LIMITES.transcricoesPorDia[plano],
  renovaEm: diaDoCalendario(agora).fim.toISOString(),
});

// Pode transcrever agora? Sem: o motivo, com quando renova.
export const decidirTranscricao = (uso: UsoDeTranscricoes, plano: Plano): {permitido: boolean; motivo?: string} =>
  uso.usadas < uso.doPlano
    ? {permitido: true}
    : {
        permitido: false,
        motivo:
          `Você já usou as ${uso.doPlano} transcrições de hoje do plano ${plano === "assinante" ? "Assinante" : "grátis"}. ` +
          "Elas renovam à meia-noite (horário de Brasília).",
      };

// Ciclo da assinatura paga (Etapa 2c): os 30 minutos contam do dia do pagamento até
// a próxima cobrança. Sem ele (assinante pelo npm run plano), o mês do calendário.
// Na tolerância de uma cobrança que falhou, o ciclo antigo continua (sem minutos
// novos até o pagamento entrar).
export type CicloDoPlano = {inicio: Date; fim: Date};

export const usoDoPlano = (plano: Plano, historico: RegistroDeExportacao[], agora: Date, ciclo?: CicloDoPlano): UsoDoPlano => {
  if (plano === "gratis") {
    return {
      plano,
      comMarca: true,
      videosUsados: historico.filter((r) => Number(r.descontado_s) > 0).length,
      videosDoPlano: LIMITES.videosNoGratis,
    };
  }
  const {inicio, fim} = ciclo ?? mesDoCalendario(agora);
  // No ciclo da assinatura, a tolerância (depois do fim) ainda conta no ciclo antigo.
  const ateQuando = ciclo ? Number.POSITIVE_INFINITY : fim.getTime();
  const segundosUsados = historico
    .filter((r) => {
      const quando = new Date(r.criado_em).getTime();
      return quando >= inicio.getTime() && quando < ateQuando;
    })
    .reduce((soma, r) => soma + Number(r.descontado_s), 0);
  return {plano, comMarca: false, segundosUsados, segundosDoPlano: LIMITES.segundosPorMesNoAssinante, renovaEm: fim.toISOString()};
};

// "2 min 05 s", "45 s".
export const duracaoEmTexto = (segundos: number): string => {
  const total = Math.ceil(segundos);
  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return minutos > 0 ? `${minutos} min ${String(resto).padStart(2, "0")} s` : `${resto} s`;
};

export const decidirExportacao = (
  plano: Plano,
  historico: RegistroDeExportacao[],
  projetoId: string | null,
  duracaoS: number,
  agora: Date,
  ciclo?: CicloDoPlano,
): DecisaoDeExportacao => {
  const uso = usoDoPlano(plano, historico, agora, ciclo);
  const exportacoesDoProjeto = projetoId ? historico.filter((r) => r.projeto_id === projetoId).length : 0;
  // Primeira exportação, ou da sexta reexportação em diante: desconta.
  const desconta = exportacoesDoProjeto === 0 || exportacoesDoProjeto > LIMITES.reexportacoesSemDesconto;
  const descontoS = desconta ? duracaoS : 0;

  if (uso.plano === "gratis") {
    const restantes = uso.videosDoPlano - uso.videosUsados;
    if (desconta && restantes <= 0) {
      return {
        permitido: false,
        codigo: "assine",
        motivo: `O plano grátis inclui ${uso.videosDoPlano} vídeo exportado, e você já usou. Assine para continuar.`,
        comMarca: true,
        descontoS,
        exportacoesDoProjeto,
        uso,
        restanteDepois: 0,
      };
    }
    return {permitido: true, comMarca: true, descontoS, exportacoesDoProjeto, uso, restanteDepois: restantes - (desconta ? 1 : 0)};
  }

  const restanteS = uso.segundosDoPlano - uso.segundosUsados;
  if (descontoS > restanteS) {
    return {
      permitido: false,
      codigo: "sem-saldo",
      motivo:
        `Este vídeo tem ${duracaoEmTexto(descontoS)} e restam ${duracaoEmTexto(Math.max(0, restanteS))} no seu plano este mês: ` +
        `faltam ${duracaoEmTexto(descontoS - Math.max(0, restanteS))}. O saldo renova em ${new Date(uso.renovaEm).toLocaleDateString("pt-BR", {timeZone: "America/Sao_Paulo"})}.`,
      comMarca: false,
      descontoS,
      exportacoesDoProjeto,
      uso,
      restanteDepois: restanteS,
    };
  }
  return {permitido: true, comMarca: false, descontoS, exportacoesDoProjeto, uso, restanteDepois: restanteS - descontoS};
};
