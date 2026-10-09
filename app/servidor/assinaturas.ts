// Assinatura pelo Mercado Pago (Etapa 2c). R$ 30 por mês, 30 minutos exportados por
// ciclo (o ciclo começa no dia do pagamento).
//
// Fluxo: "Assinar" → POST /api/assinatura cria a assinatura no Mercado Pago (sem
// plano associado, pagamento pendente) e devolve o checkout (init_point) → a pessoa
// paga lá e volta ao app (?assinatura=retorno, que NUNCA vale como prova) → o
// servidor CONSULTA o Mercado Pago (a assinatura e as cobranças dela) e aplica as
// regras abaixo. A consulta acontece: no retorno do checkout (POST
// /api/assinatura/confirmar), na verificação periódica (pendentes há mais de 2
// minutos, ativas perto da cobrança) e a cada webhook validado (x-signature, evento
// repetido ignorado, 200 na hora e processamento depois). Nenhum desses depende de um
// evento de pagamento chegar: a assinatura "authorized" com a cobrança em dia (pelo
// resumo do Mercado Pago, qualquer meio de pagamento) já ativa o plano.
//
// Regras (decisões de 2c):
//   - pagamento aprovado: assinante; ciclo = do pagamento até a próxima cobrança;
//     vale até o fim do ciclo + 5 dias de tolerância;
//   - cobrança recusada: continua assinante na tolerância, com aviso na tela; depois,
//     grátis (até um pagamento entrar);
//   - cancelamento (pelo app ou pela conta do Mercado Pago): assinante até o fim do
//     ciclo pago, sem tolerância;
//   - estorno ou chargeback (inclusive o arrependimento de 7 dias, feito no painel):
//     grátis na hora, e a assinatura é cancelada no Mercado Pago.
// Planos Básico, Pro e Editor (migração 009, veja planos.ts):
//   - o nível vem do valor que o Mercado Pago cobrou (nunca do navegador); valor
//     de nenhum plano não muda o nível (fica no log);
//   - subir: checkout novo do plano novo, pago cheio; o ciclo recomeça no pagamento
//     (os minutos do ciclo antigo não passam). A assinatura antiga só é cancelada
//     depois que o pagamento novo é aprovado; recusado, a nova é cancelada e nada muda;
//   - descer: o valor das próximas cobranças muda no Mercado Pago e o nível troca
//     na próxima cobrança aprovada (com o valor novo);
//   - vigente: a assinatura mais nova já paga; só ela mexe no perfil.
// O plano do perfil só muda para quem tem plano_origem 'assinatura': contas de
// testadores (npm run plano, origem 'manual') nunca são tocadas pelos webhooks.
// O Pix avulso (Etapa 2d, origem 'pix') fica em pix.ts; os webhooks "payment" que não
// são de assinatura vão para lá.
import type {SupabaseClient} from "@supabase/supabase-js";
import type {ApiDoMercadoPago, Pagamento, PagamentoAutorizado, Preapproval} from "./mercadopago";
import {nivelPeloValor, planoPago, planosPagos} from "./planos";
import type {Nivel, PlanoPago} from "./planos";

export const TOLERANCIA_MS = 5 * 24 * 3600 * 1000;
const UM_MES = (data: Date) => {
  const nova = new Date(data);
  nova.setUTCMonth(nova.getUTCMonth() + 1);
  return nova;
};

// ---------- dados ----------
export type StatusDaAssinatura = "pendente" | "autorizada" | "pausada" | "cancelada";

export type Assinatura = {
  id: string;
  usuario_id: string;
  mp_preapproval_id: string;
  status: StatusDaAssinatura;
  valor: number;
  init_point: string | null;
  pago_ate: string | null;
  proxima_cobranca: string | null;
  cobranca_falhou_em: string | null;
  cancelada_em: string | null;
  estornada_em: string | null;
  criado_em: string;
  // Plano desta assinatura (migração 009; vazio vale Básico).
  nivel?: Nivel;
};

export type PagamentoDaAssinatura = {
  mp_payment_id: string;
  assinatura_id: string;
  usuario_id: string;
  status: string;
  valor: number | null;
  pago_em: string | null;
};

// O que da assinatura fica no perfil.
export type PerfilDaAssinatura = {
  plano: "gratis" | "assinante";
  plano_origem: "manual" | "assinatura" | "pix";
  plano_ate: string | null;
  ciclo_inicio: string | null;
  ciclo_fim: string | null;
  // Plano pago (migração 009): Básico, Pro ou Editor; vazio vale Básico. Numa troca
  // para um plano menor, o que vale a partir da próxima renovação.
  nivel?: Nivel;
  nivel_na_renovacao?: Nivel | null;
};

// Colunas do perfil lidas com a assinatura (sem a migração 009, sem o nível).
export const COLUNAS_DO_PERFIL = ["plano, plano_origem, plano_ate, ciclo_inicio, ciclo_fim, nivel, nivel_na_renovacao", "plano, plano_origem, plano_ate, ciclo_inicio, ciclo_fim"];

export type Evento = {request_id: string; tipo: string; data_id: string; tentativas: number};

export type BancoDeAssinaturas = {
  // false: o evento já tinha chegado (repetido).
  novoEvento: (evento: {request_id: string; tipo: string; data_id: string}) => Promise<boolean>;
  eventosPendentes: () => Promise<Evento[]>;
  marcarEvento: (requestId: string, resultado: {processado: boolean; erro?: string; tentativas: number}) => Promise<void>;
  assinaturaPorPreapproval: (preapprovalId: string) => Promise<Assinatura | undefined>;
  assinaturaDaConta: (usuarioId: string) => Promise<Assinatura | undefined>;
  // Todas as assinaturas da conta, da mais nova para a mais antiga.
  assinaturasDaConta: (usuarioId: string) => Promise<Assinatura[]>;
  criarAssinatura: (linha: Omit<Assinatura, "id" | "criado_em" | "pago_ate" | "proxima_cobranca" | "cobranca_falhou_em" | "cancelada_em" | "estornada_em">) => Promise<Assinatura>;
  salvarAssinatura: (id: string, campos: Partial<Assinatura>) => Promise<void>;
  pagamento: (mpPaymentId: string) => Promise<PagamentoDaAssinatura | undefined>;
  salvarPagamento: (pagamento: PagamentoDaAssinatura & {dados?: unknown}) => Promise<void>;
  perfil: (usuarioId: string) => Promise<PerfilDaAssinatura>;
  salvarPerfil: (usuarioId: string, campos: Partial<PerfilDaAssinatura>) => Promise<void>;
  // Para a verificação periódica: pagamentos aprovados desde a data (estorno sem webhook).
  pagamentosParaConferir: (desde: Date) => Promise<PagamentoDaAssinatura[]>;
  // Para a verificação periódica: pendentes criadas no intervalo e autorizadas com a
  // próxima cobrança no intervalo.
  assinaturasParaConferir: (limites: {pendentesDe: Date; pendentesAte: Date; cobrancaDe: Date; cobrancaAte: Date}) => Promise<Assinatura[]>;
};

// ---------- regras (funções puras) ----------
// A assinatura que vale (lista da mais nova para a mais antiga): a mais nova já paga;
// sem nenhuma paga, a mais nova. Um checkout de troca de plano ainda não pago (ou
// recusado) não é a vigente.
export const assinaturaVigente = (lista: Assinatura[]): Assinatura | undefined => lista.find((a) => a.pago_ate) ?? lista[0];

// Uma assinatura mais nova já foi paga: esta foi trocada (troca de plano).
export const substituida = (assinatura: Assinatura, lista: Assinatura[]): boolean =>
  lista.some((outra) => outra.id !== assinatura.id && outra.pago_ate && new Date(outra.criado_em) > new Date(assinatura.criado_em));

const statusDaApi: Record<Preapproval["status"], StatusDaAssinatura> = {
  pending: "pendente",
  authorized: "autorizada",
  paused: "pausada",
  cancelled: "cancelada",
};

// O plano que vale agora: o assinante por assinatura ou por Pix acaba em plano_ate.
export const planoEfetivo = (perfil: PerfilDaAssinatura, agora: Date): "gratis" | "assinante" =>
  perfil.plano === "assinante" && perfil.plano_origem !== "manual" && perfil.plano_ate && new Date(perfil.plano_ate) <= agora
    ? "gratis"
    : perfil.plano;

// A assinatura mudou (criada, autorizada, pausada, cancelada).
export const regraDaAssinatura = (
  assinatura: Assinatura,
  pre: Preapproval,
  perfil: PerfilDaAssinatura,
  agora: Date,
): {assinatura: Partial<Assinatura>; perfil?: Partial<PerfilDaAssinatura>} => {
  const status = statusDaApi[pre.status] ?? assinatura.status;
  const campos: Partial<Assinatura> = {status, proxima_cobranca: pre.next_payment_date ?? assinatura.proxima_cobranca};
  if ((status === "cancelada" || status === "pausada") && !assinatura.cancelada_em) {
    campos.cancelada_em = agora.toISOString();
  }
  // Cancelada ou pausada: o assinante vai até o fim do ciclo pago, sem tolerância.
  if ((status === "cancelada" || status === "pausada") && perfil.plano_origem === "assinatura" && perfil.plano === "assinante") {
    const fim = perfil.ciclo_fim ?? agora.toISOString();
    return {assinatura: campos, perfil: {plano_ate: new Date(fim) < agora ? agora.toISOString() : fim}};
  }
  // Reativada: volta a tolerância normal sobre o ciclo pago.
  if (status === "autorizada" && assinatura.status !== "autorizada" && perfil.plano_origem === "assinatura" && perfil.ciclo_fim) {
    return {assinatura: campos, perfil: {plano_ate: new Date(new Date(perfil.ciclo_fim).getTime() + TOLERANCIA_MS).toISOString()}};
  }
  return {assinatura: campos};
};

// Uma cobrança da assinatura (aprovada, recusada ou em nova tentativa).
export const regraDaCobranca = (
  assinatura: Assinatura,
  cobranca: PagamentoAutorizado,
  pre: Preapproval | undefined,
  perfil: PerfilDaAssinatura,
  agora: Date,
): {assinatura: Partial<Assinatura>; perfil?: Partial<PerfilDaAssinatura>; pagamento?: PagamentoDaAssinatura; aviso?: string} => {
  // Cobrança ainda sem pagamento (o Mercado Pago manda o objeto vazio, sem id): nada a registrar.
  const pagamento = cobranca.payment?.id ? cobranca.payment : undefined;
  const statusDoPagamento = pagamento?.status ?? "";
  const registro = pagamento
    ? {
        mp_payment_id: String(pagamento.id),
        assinatura_id: assinatura.id,
        usuario_id: assinatura.usuario_id,
        status: statusDoPagamento,
        valor: cobranca.transaction_amount ?? null,
        pago_em: statusDoPagamento === "approved" ? (cobranca.debit_date ?? cobranca.date_created ?? agora.toISOString()) : null,
      }
    : undefined;
  if (statusDoPagamento === "approved" && registro) {
    const inicio = new Date(registro.pago_em!);
    // Um pagamento mais antigo que o ciclo atual (evento fora de ordem) não volta o ciclo.
    if (perfil.plano_origem === "assinatura" && perfil.ciclo_inicio && new Date(perfil.ciclo_inicio) > inicio) {
      return {assinatura: {}, pagamento: registro};
    }
    const proxima = pre?.next_payment_date ? new Date(pre.next_payment_date) : undefined;
    const fim = proxima && proxima > inicio ? proxima : UM_MES(inicio);
    const cancelada = (pre ? statusDaApi[pre.status] : assinatura.status) === "cancelada";
    // O nível pelo valor cobrado; de nenhum plano, o nível não muda.
    const nivel = nivelPeloValor(cobranca.transaction_amount);
    return {
      assinatura: {
        pago_ate: fim.toISOString(),
        proxima_cobranca: pre?.next_payment_date ?? fim.toISOString(),
        cobranca_falhou_em: null,
        ...(pre ? {status: statusDaApi[pre.status]} : {}),
        ...(nivel ? {nivel} : {}),
      },
      perfil: {
        plano: "assinante",
        plano_origem: "assinatura",
        ciclo_inicio: inicio.toISOString(),
        ciclo_fim: fim.toISOString(),
        plano_ate: (cancelada ? fim : new Date(fim.getTime() + TOLERANCIA_MS)).toISOString(),
        ...(nivel ? {nivel, nivel_na_renovacao: null} : {}),
      },
      pagamento: registro,
      aviso: nivel ? undefined : `valor cobrado (${cobranca.transaction_amount}) não é de nenhum plano: nível mantido`,
    };
  }
  // Recusada (o Mercado Pago tenta de novo por alguns dias): aviso na tela; o plano
  // segue até plano_ate (fim do ciclo + 5 dias).
  if (statusDoPagamento === "rejected" || cobranca.status === "recycling") {
    return {assinatura: {cobranca_falhou_em: assinatura.cobranca_falhou_em ?? agora.toISOString()}, pagamento: registro};
  }
  return {assinatura: {}, pagamento: registro};
};

// A cobrança está em dia pelo resumo do Mercado Pago (summarized): já houve cobrança
// e o semáforo não está vermelho. Vale para qualquer meio de pagamento (cartão, saldo
// em conta), sem depender do evento de pagamento.
export const cobrancaEmDia = (pre: Preapproval): boolean => {
  const resumo = pre.summarized;
  if (!resumo || resumo.semaphore === "red") return false;
  return (resumo.charged_quantity ?? 0) >= 1 || Boolean(resumo.last_charged_date) || (resumo.last_charged_amount ?? 0) > 0;
};

// Assinatura autorizada com a cobrança em dia: assinante, mesmo sem o evento (ou a
// consulta) do pagamento. O ciclo vai da última cobrança até a próxima.
export const regraDaAutorizacao = (
  pre: Preapproval,
  perfil: PerfilDaAssinatura,
  agora: Date,
): {assinatura: Partial<Assinatura>; perfil: Partial<PerfilDaAssinatura>} | undefined => {
  if (pre.status !== "authorized" || !cobrancaEmDia(pre)) return undefined;
  const inicio = new Date(pre.summarized?.last_charged_date ?? pre.date_created ?? agora.toISOString());
  const proxima = pre.next_payment_date ? new Date(pre.next_payment_date) : undefined;
  const fim = proxima && proxima > inicio ? proxima : UM_MES(inicio);
  // O ciclo atual já cobre este (pelo pagamento ou por uma consulta anterior): nada muda.
  const DIA = 24 * 3600 * 1000;
  if (perfil.plano === "assinante" && perfil.plano_origem === "assinatura" && perfil.ciclo_fim && new Date(perfil.ciclo_fim).getTime() >= fim.getTime() - DIA) {
    return undefined;
  }
  // O nível pelo último valor cobrado (o resumo do Mercado Pago).
  const nivel = nivelPeloValor(pre.summarized?.last_charged_amount);
  return {
    assinatura: {status: "autorizada", pago_ate: fim.toISOString(), proxima_cobranca: pre.next_payment_date ?? fim.toISOString(), cobranca_falhou_em: null, ...(nivel ? {nivel} : {})},
    perfil: {
      plano: "assinante",
      plano_origem: "assinatura",
      ciclo_inicio: inicio.toISOString(),
      ciclo_fim: fim.toISOString(),
      plano_ate: new Date(fim.getTime() + TOLERANCIA_MS).toISOString(),
      ...(nivel ? {nivel, nivel_na_renovacao: null} : {}),
    },
  };
};

// Um pagamento já registrado mudou (estorno, chargeback).
export const ESTORNOS = ["refunded", "charged_back"];
export const regraDoPagamento = (
  pagamento: Pagamento,
  perfil: PerfilDaAssinatura,
  agora: Date,
): {estornado: boolean; perfil?: Partial<PerfilDaAssinatura>} => {
  if (!ESTORNOS.includes(pagamento.status)) return {estornado: false};
  return {
    estornado: true,
    // Grátis na hora (só quem é assinante pela assinatura).
    perfil: perfil.plano_origem === "assinatura" ? {plano: "gratis", plano_ate: agora.toISOString()} : undefined,
  };
};

// ---------- resumo para a tela ----------
export type ResumoDaAssinatura = {
  // O Mercado Pago está configurado (sem ele, nada de "Assinar").
  disponivel: boolean;
  // Valor mensal do plano atual (sem plano: o do Básico).
  valor: number;
  // Plano pago atual (assinante) e, numa troca para baixo, o da próxima renovação.
  nivel?: Nivel;
  nivelNaRenovacao?: Nivel;
  // Os três planos, para a tela de escolher.
  planos: PlanoPago[];
  // nenhuma: pode assinar; ativa: renova em renovaEm; cancelada: assinante até ate;
  // falhou: a cobrança falhou, assinante até ate (tolerância); cortesia: assinante
  // pelo npm run plano (sem cobrança); pix: assinante por Pix até ate (sem renovação).
  situacao: "nenhuma" | "ativa" | "cancelada" | "falhou" | "cortesia" | "pix";
  renovaEm?: string;
  ate?: string;
};

export const resumoDaAssinatura = (
  perfil: PerfilDaAssinatura,
  assinatura: Assinatura | undefined,
  agora: Date,
  disponivel: boolean,
): ResumoDaAssinatura => {
  const plano = planoEfetivo(perfil, agora);
  const nivel = plano === "assinante" ? (perfil.nivel ?? "basico") : undefined;
  const base = {
    disponivel,
    valor: planoPago(nivel ?? "basico").valor,
    planos: planosPagos(),
    ...(nivel ? {nivel} : {}),
    ...(nivel && perfil.nivel_na_renovacao && perfil.nivel_na_renovacao !== nivel ? {nivelNaRenovacao: perfil.nivel_na_renovacao} : {}),
  };
  if (plano === "assinante" && perfil.plano_origem === "manual") return {...base, situacao: "cortesia"};
  if (plano !== "assinante") return {...base, situacao: "nenhuma"};
  const ate = perfil.plano_ate ?? undefined;
  if (perfil.plano_origem === "pix") return {...base, situacao: "pix", ate};
  if (assinatura?.status === "cancelada" || assinatura?.status === "pausada") return {...base, situacao: "cancelada", ate: perfil.ciclo_fim ?? ate};
  if (assinatura?.cobranca_falhou_em || (perfil.ciclo_fim && new Date(perfil.ciclo_fim) <= agora)) return {...base, situacao: "falhou", ate};
  return {...base, situacao: "ativa", renovaEm: perfil.ciclo_fim ?? undefined};
};

// ---------- processamento dos eventos ----------
export const processadorDeEventos = ({
  banco,
  api,
  agora = () => new Date(),
  outroPagamento,
  registrar = (linha: string) => console.log(`Mercado Pago: ${linha}`),
}: {
  banco: BancoDeAssinaturas;
  api: ApiDoMercadoPago;
  agora?: () => Date;
  registrar?: (linha: string) => void;
  // Pagamento que não é de assinatura (o Pix avulso, veja pix.ts): undefined se não for de lá.
  outroPagamento?: (pagamentoId: string) => Promise<string | undefined>;
}) => {
  const aplicarNoPerfil = async (usuarioId: string, campos: Partial<PerfilDaAssinatura> | undefined) => {
    if (campos && Object.keys(campos).length > 0) await banco.salvarPerfil(usuarioId, campos);
  };

  const assinaturaConferida = async (preapprovalId: string, pre?: Preapproval) => {
    const assinatura = await banco.assinaturaPorPreapproval(preapprovalId);
    // Só assinaturas criadas por este servidor, e da conta certa.
    if (!assinatura) return undefined;
    if (pre?.external_reference && pre.external_reference !== assinatura.usuario_id) return undefined;
    return assinatura;
  };

  // Cancela no Mercado Pago as outras assinaturas da conta ainda não canceladas (a
  // troca de plano foi paga). Só a linha muda: o perfil já é o da assinatura nova.
  const cancelarAsOutras = async (paga: Assinatura) => {
    for (const outra of await banco.assinaturasDaConta(paga.usuario_id)) {
      // Só as mais antigas: um checkout de troca aberto depois continua valendo.
      if (outra.id === paga.id || outra.status === "cancelada" || new Date(outra.criado_em) >= new Date(paga.criado_em)) continue;
      try {
        await api.cancelarAssinatura(outra.mp_preapproval_id);
        await banco.salvarAssinatura(outra.id, {status: "cancelada", cancelada_em: outra.cancelada_em ?? agora().toISOString()});
        registrar(`troca de plano: ${outra.mp_preapproval_id} cancelada (a nova ${paga.mp_preapproval_id} foi paga)`);
      } catch (erro) {
        // Fica para a próxima consulta (a nova já vale; a antiga não deve cobrar de novo).
        registrar(`troca de plano: cancelar ${outra.mp_preapproval_id}: ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }
  };

  // Aplica uma cobrança (vinda do webhook ou da busca das cobranças da assinatura).
  const aplicarCobranca = async (assinatura: Assinatura, cobranca: PagamentoAutorizado, pre: Preapproval | undefined) => {
    const perfil = await banco.perfil(assinatura.usuario_id);
    const lista = await banco.assinaturasDaConta(assinatura.usuario_id);
    const efeito = regraDaCobranca(assinatura, cobranca, pre, perfil, agora());
    if (efeito.aviso) registrar(`${assinatura.mp_preapproval_id}: ${efeito.aviso}`);
    if (efeito.pagamento) await banco.salvarPagamento({...efeito.pagamento, dados: cobranca});
    if (Object.keys(efeito.assinatura).length > 0) await banco.salvarAssinatura(assinatura.id, efeito.assinatura);
    const atualizada = {...assinatura, ...efeito.assinatura};
    // Uma assinatura já trocada por outra paga não mexe mais no perfil.
    if (substituida(assinatura, lista)) return atualizada;
    // Troca de plano recusada: a assinatura nova é cancelada (sem novas tentativas de
    // cobrança) e a antiga, já paga, continua valendo, sem nada mudar no perfil.
    const anteriorPaga = lista.find((outra) => outra.id !== assinatura.id && outra.pago_ate && outra.status !== "cancelada");
    if (efeito.assinatura.cobranca_falhou_em && !assinatura.pago_ate && anteriorPaga) {
      if (atualizada.status !== "cancelada") {
        await api.cancelarAssinatura(assinatura.mp_preapproval_id).catch((erro: unknown) =>
          registrar(`troca recusada: cancelar ${assinatura.mp_preapproval_id}: ${erro instanceof Error ? erro.message : String(erro)}`),
        );
      }
      const cancelada = {status: "cancelada" as const, cancelada_em: atualizada.cancelada_em ?? agora().toISOString()};
      await banco.salvarAssinatura(assinatura.id, cancelada);
      registrar(`troca de plano recusada: ${assinatura.mp_preapproval_id} cancelada; continua no plano de antes`);
      return {...atualizada, ...cancelada};
    }
    await aplicarNoPerfil(assinatura.usuario_id, efeito.perfil);
    if (efeito.perfil?.plano === "assinante") await cancelarAsOutras(atualizada);
    return atualizada;
  };

  // Consulta a assinatura no Mercado Pago (o status, as cobranças e o resumo delas) e
  // aplica as regras. Não depende de nenhum evento: é o que o retorno do checkout, a
  // verificação periódica e os webhooks usam.
  const sincronizar = async (inicial: Assinatura): Promise<string> => {
    const pre = await api.assinatura(inicial.mp_preapproval_id);
    // Só a assinatura desta conta (o external_reference é o id da conta).
    if (pre.external_reference !== inicial.usuario_id) return "ignorado: external_reference de outra conta";
    let assinatura = inicial;
    const efeito = regraDaAssinatura(assinatura, pre, await banco.perfil(assinatura.usuario_id), agora());
    await banco.salvarAssinatura(assinatura.id, efeito.assinatura);
    // Cancelar ou pausar só mexe no perfil se esta é a assinatura que vale (não a
    // antiga de uma troca de plano, nem um checkout de troca ainda não pago).
    if (assinaturaVigente(await banco.assinaturasDaConta(assinatura.usuario_id))?.id === assinatura.id) {
      await aplicarNoPerfil(assinatura.usuario_id, efeito.perfil);
    }
    assinatura = {...assinatura, ...efeito.assinatura};
    // As cobranças, da mais antiga para a mais nova (a busca pode falhar: o resumo basta).
    const cobrancas = await api.cobrancasDaAssinatura(assinatura.mp_preapproval_id).catch(() => [] as PagamentoAutorizado[]);
    const quando = (cobranca: PagamentoAutorizado) => new Date(cobranca.debit_date ?? cobranca.date_created ?? 0).getTime();
    for (const cobranca of [...cobrancas].sort((a, b) => quando(a) - quando(b))) {
      if (cobranca.preapproval_id && cobranca.preapproval_id !== assinatura.mp_preapproval_id) continue;
      const conhecido = cobranca.payment?.id ? await banco.pagamento(String(cobranca.payment.id)) : undefined;
      if (conhecido && conhecido.status === cobranca.payment?.status) continue;
      assinatura = await aplicarCobranca(assinatura, cobranca, pre);
    }
    // Autorizada com a cobrança em dia (mesmo sem nenhuma cobrança encontrada).
    const autorizacao =
      assinatura.status === "cancelada" || substituida(assinatura, await banco.assinaturasDaConta(assinatura.usuario_id))
        ? undefined
        : regraDaAutorizacao(pre, await banco.perfil(assinatura.usuario_id), agora());
    if (autorizacao) {
      await banco.salvarAssinatura(assinatura.id, autorizacao.assinatura);
      await aplicarNoPerfil(assinatura.usuario_id, autorizacao.perfil);
      await cancelarAsOutras({...assinatura, ...autorizacao.assinatura});
    }
    return `assinatura ${pre.status}, ${cobrancas.length} cobrança(s)${autorizacao ? ", plano ativado pelo resumo" : ""}`;
  };

  const daAssinatura = async (preapprovalId: string) => {
    const assinatura = await banco.assinaturaPorPreapproval(preapprovalId);
    if (!assinatura) return "ignorado: assinatura desconhecida";
    return sincronizar(assinatura);
  };

  const daCobranca = async (cobrancaId: string) => {
    let cobranca: PagamentoAutorizado;
    try {
      cobranca = await api.pagamentoAutorizado(cobrancaId);
    } catch (erro) {
      // O id não é de uma cobrança, mas de uma assinatura nossa (como no simulador do
      // painel): consulta a assinatura.
      const assinatura = await banco.assinaturaPorPreapproval(cobrancaId);
      if (assinatura) return sincronizar(assinatura);
      throw erro;
    }
    const pre = await api.assinatura(cobranca.preapproval_id).catch(() => undefined);
    const assinatura = await assinaturaConferida(cobranca.preapproval_id, pre);
    if (!assinatura) return "ignorado: assinatura desconhecida";
    await aplicarCobranca(assinatura, cobranca, pre);
    return `cobrança ${cobranca.payment?.status ?? cobranca.status}`;
  };

  // Uma consulta por assinatura dentro do intervalo (para não sobrecarregar a API).
  const ultimaConsulta = new Map<string, number>();
  const consultar = async (assinatura: Assinatura, intervaloMs: number): Promise<string | undefined> => {
    const agoraMs = agora().getTime();
    const ultima = ultimaConsulta.get(assinatura.id);
    if (ultima !== undefined && agoraMs - ultima < intervaloMs) return undefined;
    ultimaConsulta.set(assinatura.id, agoraMs);
    return sincronizar(assinatura);
  };

  // Volta do checkout: a conta pede a confirmação; o servidor consulta a assinatura
  // dela no Mercado Pago (no máximo uma vez a cada 5 segundos).
  const confirmarDaConta = async (usuarioId: string): Promise<string> => {
    const assinatura = await banco.assinaturaDaConta(usuarioId);
    if (!assinatura || assinatura.status === "cancelada") return "sem assinatura para confirmar";
    return (await consultar(assinatura, 5_000)) ?? "consultada há pouco";
  };

  // Verificação periódica: pendentes há mais de 2 minutos (até 3 dias) e autorizadas
  // perto da cobrança (de 10 dias atrás até amanhã). Cada uma é consultada no máximo a
  // cada 10 minutos (pendente) ou 1 hora (autorizada), e até 5 por rodada.
  // Junto, os pagamentos aprovados dos últimos 35 dias (o ciclo e o arrependimento de
  // 7 dias), cada um a cada 30 minutos, até 5 por rodada: um estorno sem webhook (ou
  // com o webhook perdido) volta o perfil para grátis em até ~30 minutos.
  const LIMITE_POR_RODADA = 5;
  const ultimaConsultaDoPagamento = new Map<string, number>();
  const verificarEstornos = async (): Promise<string[]> => {
    const agoraMs = agora().getTime();
    const resultados: string[] = [];
    let consultados = 0;
    for (const pagamento of await banco.pagamentosParaConferir(new Date(agoraMs - 35 * 24 * 3600_000))) {
      if (consultados >= LIMITE_POR_RODADA) break;
      const ultima = ultimaConsultaDoPagamento.get(pagamento.mp_payment_id);
      if (ultima !== undefined && agoraMs - ultima < 30 * 60_000) continue;
      ultimaConsultaDoPagamento.set(pagamento.mp_payment_id, agoraMs);
      consultados++;
      try {
        const resultado = await doPagamento(pagamento.mp_payment_id);
        // Só o que mudou vai para o log (aprovado continua aprovado: nada).
        if (resultado !== "pagamento approved") resultados.push(`verificação do pagamento ${pagamento.mp_payment_id}: ${resultado}`);
      } catch (erro) {
        resultados.push(`verificação do pagamento ${pagamento.mp_payment_id}: erro ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }
    return resultados;
  };
  const verificarAssinaturas = async (): Promise<string[]> => {
    const agoraMs = agora().getTime();
    const MIN = 60_000;
    const lista = await banco.assinaturasParaConferir({
      pendentesDe: new Date(agoraMs - 3 * 24 * 60 * MIN),
      pendentesAte: new Date(agoraMs - 2 * MIN),
      cobrancaDe: new Date(agoraMs - 10 * 24 * 60 * MIN),
      cobrancaAte: new Date(agoraMs + 24 * 60 * MIN),
    });
    const resultados: string[] = [];
    for (const assinatura of lista) {
      if (resultados.length >= LIMITE_POR_RODADA) break;
      try {
        const resultado = await consultar(assinatura, assinatura.status === "pendente" ? 10 * MIN : 60 * MIN);
        if (resultado) resultados.push(`verificação ${assinatura.mp_preapproval_id}: ${resultado}`);
      } catch (erro) {
        resultados.push(`verificação ${assinatura.mp_preapproval_id}: erro ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }
    return [...resultados, ...(await verificarEstornos())];
  };

  const doPagamento = async (pagamentoId: string) => {
    const conhecido = await banco.pagamento(pagamentoId);
    // Só pagamentos de assinatura já registrados (vindos das cobranças); os outros
    // podem ser de um Pix.
    if (!conhecido) return (await outroPagamento?.(pagamentoId)) ?? "ignorado: pagamento desconhecido";
    const pagamento = await api.pagamento(pagamentoId);
    // Sem os dados do pagador (documento, nome) e do cartão.
    const {payer: _pagador, card: _cartao, ...semPagador} = pagamento as Pagamento & {payer?: unknown; card?: unknown};
    await banco.salvarPagamento({...conhecido, status: pagamento.status, dados: semPagador});
    const perfil = await banco.perfil(conhecido.usuario_id);
    const efeito = regraDoPagamento(pagamento, perfil, agora());
    if (!efeito.estornado) return `pagamento ${pagamento.status}`;
    // Estorno de um pagamento da assinatura que vale: grátis na hora. De uma antiga
    // (já trocada por outro plano pago), o plano atual continua.
    const vigente = assinaturaVigente(await banco.assinaturasDaConta(conhecido.usuario_id));
    if (vigente?.id !== conhecido.assinatura_id) return `pagamento ${pagamento.status} (de uma assinatura antiga: plano mantido)`;
    await aplicarNoPerfil(conhecido.usuario_id, efeito.perfil);
    // Estorno: a assinatura é cancelada no Mercado Pago (sem novas cobranças).
    const assinatura = (await banco.assinaturaDaConta(conhecido.usuario_id)) ?? undefined;
    if (assinatura && assinatura.id === conhecido.assinatura_id) {
      if (assinatura.status !== "cancelada") await api.cancelarAssinatura(assinatura.mp_preapproval_id).catch(() => undefined);
      await banco.salvarAssinatura(assinatura.id, {status: "cancelada", cancelada_em: assinatura.cancelada_em ?? agora().toISOString(), estornada_em: agora().toISOString()});
    }
    return `pagamento ${pagamento.status}: plano grátis`;
  };

  // Processa um evento já guardado (sempre consultando o Mercado Pago).
  const processar = async (evento: Evento): Promise<string> => {
    if (evento.tipo === "subscription_preapproval") return daAssinatura(evento.data_id);
    if (evento.tipo === "subscription_authorized_payment") return daCobranca(evento.data_id);
    if (evento.tipo === "payment") return doPagamento(evento.data_id);
    return `ignorado: tipo ${evento.tipo}`;
  };

  // Recebe um webhook já validado: guarda (repetido é ignorado) e processa depois.
  const receber = async (evento: {request_id: string; tipo: string; data_id: string}): Promise<"novo" | "repetido"> =>
    (await banco.novoEvento(evento)) ? "novo" : "repetido";

  // Processa os eventos pendentes (os recém-chegados e os que falharam antes).
  const MAX_TENTATIVAS = 10;
  let rodando = false;
  const processarPendentes = async (): Promise<string[]> => {
    if (rodando) return [];
    rodando = true;
    const resultados: string[] = [];
    try {
      for (const evento of await banco.eventosPendentes()) {
        if (evento.tentativas >= MAX_TENTATIVAS) continue;
        try {
          const resultado = await processar(evento);
          await banco.marcarEvento(evento.request_id, {processado: true, tentativas: evento.tentativas + 1});
          resultados.push(`${evento.tipo} ${evento.data_id}: ${resultado}`);
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          await banco.marcarEvento(evento.request_id, {processado: false, erro: mensagem, tentativas: evento.tentativas + 1});
          resultados.push(`${evento.tipo} ${evento.data_id}: erro ${mensagem}`);
        }
      }
    } finally {
      rodando = false;
    }
    return resultados;
  };

  return {receber, processar, processarPendentes, sincronizar, confirmarDaConta, verificarAssinaturas};
};

// ---------- banco no Supabase (chave secreta) ----------
export const bancoNoSupabase = (admin: SupabaseClient): BancoDeAssinaturas => {
  const falha = (acao: string, erro: {message: string} | null) => {
    if (erro) throw new Error(`Assinatura: não foi possível ${acao}: ${erro.message}`);
  };
  const agora = () => new Date().toISOString();
  return {
    novoEvento: async (evento) => {
      const {error} = await admin.from("eventos_mercadopago").insert(evento);
      // 23505: chave repetida (o mesmo x-request-id).
      if (error && (error as {code?: string}).code === "23505") return false;
      falha("guardar o evento", error);
      return true;
    },
    eventosPendentes: async () => {
      const {data, error} = await admin
        .from("eventos_mercadopago")
        .select("request_id, tipo, data_id, tentativas")
        .is("processado_em", null)
        .order("recebido_em")
        .limit(50);
      falha("ler os eventos", error);
      return (data ?? []) as Evento[];
    },
    marcarEvento: async (requestId, {processado, erro, tentativas}) => {
      const {error} = await admin
        .from("eventos_mercadopago")
        .update({processado_em: processado ? agora() : null, erro: erro ?? null, tentativas})
        .eq("request_id", requestId);
      falha("marcar o evento", error);
    },
    assinaturaPorPreapproval: async (id) => {
      const {data, error} = await admin.from("assinaturas").select("*").eq("mp_preapproval_id", id).maybeSingle();
      falha("ler a assinatura", error);
      return (data as Assinatura | null) ?? undefined;
    },
    assinaturaDaConta: async (usuarioId) => {
      const {data, error} = await admin.from("assinaturas").select("*").eq("usuario_id", usuarioId).order("criado_em", {ascending: false}).limit(1).maybeSingle();
      falha("ler a assinatura", error);
      return (data as Assinatura | null) ?? undefined;
    },
    assinaturasDaConta: async (usuarioId) => {
      const {data, error} = await admin.from("assinaturas").select("*").eq("usuario_id", usuarioId).order("criado_em", {ascending: false}).limit(20);
      falha("ler as assinaturas", error);
      return (data as Assinatura[] | null) ?? [];
    },
    criarAssinatura: async (linha) => {
      const {data, error} = await admin.from("assinaturas").insert(linha).select("*").single();
      falha("criar a assinatura", error);
      return data as Assinatura;
    },
    salvarAssinatura: async (id, campos) => {
      const {error} = await admin.from("assinaturas").update({...campos, atualizado_em: agora()}).eq("id", id);
      falha("salvar a assinatura", error);
    },
    pagamento: async (id) => {
      const {data, error} = await admin.from("pagamentos_assinatura").select("*").eq("mp_payment_id", id).maybeSingle();
      falha("ler o pagamento", error);
      return (data as PagamentoDaAssinatura | null) ?? undefined;
    },
    salvarPagamento: async (pagamento) => {
      const {error} = await admin.from("pagamentos_assinatura").upsert({...pagamento, atualizado_em: agora()}, {onConflict: "mp_payment_id"});
      falha("salvar o pagamento", error);
    },
    perfil: async (usuarioId) => {
      let {data, error} = await admin.from("perfis").select(COLUNAS_DO_PERFIL[0]).eq("id", usuarioId).maybeSingle();
      if (error && /column|coluna/iu.test(error.message)) ({data, error} = await admin.from("perfis").select(COLUNAS_DO_PERFIL[1]).eq("id", usuarioId).maybeSingle());
      falha("ler o perfil", error);
      return (data as PerfilDaAssinatura | null) ?? {plano: "gratis", plano_origem: "manual", plano_ate: null, ciclo_inicio: null, ciclo_fim: null};
    },
    salvarPerfil: async (usuarioId, campos) => {
      const {error} = await admin.from("perfis").update(campos).eq("id", usuarioId);
      falha("salvar o perfil", error);
    },
    pagamentosParaConferir: async (desde) => {
      const {data, error} = await admin
        .from("pagamentos_assinatura")
        .select("mp_payment_id, assinatura_id, usuario_id, status, valor, pago_em")
        .eq("status", "approved")
        .gte("pago_em", desde.toISOString())
        .order("pago_em", {ascending: false})
        .limit(200);
      falha("ler os pagamentos para conferir", error);
      return (data ?? []) as PagamentoDaAssinatura[];
    },
    assinaturasParaConferir: async ({pendentesDe, pendentesAte, cobrancaDe, cobrancaAte}) => {
      const pendentes = await admin
        .from("assinaturas")
        .select("*")
        .eq("status", "pendente")
        .gte("criado_em", pendentesDe.toISOString())
        .lte("criado_em", pendentesAte.toISOString())
        .order("criado_em", {ascending: false})
        .limit(50);
      falha("ler as assinaturas pendentes", pendentes.error);
      const ativas = await admin
        .from("assinaturas")
        .select("*")
        .eq("status", "autorizada")
        .gte("proxima_cobranca", cobrancaDe.toISOString())
        .lte("proxima_cobranca", cobrancaAte.toISOString())
        .order("proxima_cobranca")
        .limit(50);
      falha("ler as assinaturas ativas", ativas.error);
      return [...((pendentes.data ?? []) as Assinatura[]), ...((ativas.data ?? []) as Assinatura[])];
    },
  };
};
