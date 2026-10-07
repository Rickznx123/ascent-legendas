// Assinatura pelo Mercado Pago (Etapa 2c). R$ 30 por mês, 30 minutos exportados por
// ciclo (o ciclo começa no dia do pagamento).
//
// Fluxo: "Assinar" → POST /api/assinatura cria a assinatura no Mercado Pago (sem
// plano associado, pagamento pendente) e devolve o checkout (init_point) → a pessoa
// paga lá e volta ao app (?assinatura=retorno, que NUNCA vale como prova) → o
// Mercado Pago avisa por webhook → o servidor valida o x-signature, guarda o evento
// (repetido é ignorado), responde 200 e, depois, CONSULTA o Mercado Pago e aplica as
// regras abaixo.
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
// O plano do perfil só muda para quem tem plano_origem 'assinatura': contas de
// testadores (npm run plano, origem 'manual') nunca são tocadas pelos webhooks.
import type {SupabaseClient} from "@supabase/supabase-js";
import type {ApiDoMercadoPago, Pagamento, PagamentoAutorizado, Preapproval} from "./mercadopago";

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
  plano_origem: "manual" | "assinatura";
  plano_ate: string | null;
  ciclo_inicio: string | null;
  ciclo_fim: string | null;
};

export type Evento = {request_id: string; tipo: string; data_id: string; tentativas: number};

export type BancoDeAssinaturas = {
  // false: o evento já tinha chegado (repetido).
  novoEvento: (evento: {request_id: string; tipo: string; data_id: string}) => Promise<boolean>;
  eventosPendentes: () => Promise<Evento[]>;
  marcarEvento: (requestId: string, resultado: {processado: boolean; erro?: string; tentativas: number}) => Promise<void>;
  assinaturaPorPreapproval: (preapprovalId: string) => Promise<Assinatura | undefined>;
  assinaturaDaConta: (usuarioId: string) => Promise<Assinatura | undefined>;
  criarAssinatura: (linha: Omit<Assinatura, "id" | "criado_em" | "pago_ate" | "proxima_cobranca" | "cobranca_falhou_em" | "cancelada_em" | "estornada_em">) => Promise<Assinatura>;
  salvarAssinatura: (id: string, campos: Partial<Assinatura>) => Promise<void>;
  pagamento: (mpPaymentId: string) => Promise<PagamentoDaAssinatura | undefined>;
  salvarPagamento: (pagamento: PagamentoDaAssinatura & {dados?: unknown}) => Promise<void>;
  perfil: (usuarioId: string) => Promise<PerfilDaAssinatura>;
  salvarPerfil: (usuarioId: string, campos: Partial<PerfilDaAssinatura>) => Promise<void>;
};

// ---------- regras (funções puras) ----------
const statusDaApi: Record<Preapproval["status"], StatusDaAssinatura> = {
  pending: "pendente",
  authorized: "autorizada",
  paused: "pausada",
  cancelled: "cancelada",
};

// O plano que vale agora: o assinante por assinatura acaba em plano_ate.
export const planoEfetivo = (perfil: PerfilDaAssinatura, agora: Date): "gratis" | "assinante" =>
  perfil.plano === "assinante" && perfil.plano_origem === "assinatura" && perfil.plano_ate && new Date(perfil.plano_ate) <= agora
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
): {assinatura: Partial<Assinatura>; perfil?: Partial<PerfilDaAssinatura>; pagamento?: PagamentoDaAssinatura} => {
  const pagamento = cobranca.payment;
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
    return {
      assinatura: {
        pago_ate: fim.toISOString(),
        proxima_cobranca: pre?.next_payment_date ?? fim.toISOString(),
        cobranca_falhou_em: null,
        ...(pre ? {status: statusDaApi[pre.status]} : {}),
      },
      perfil: {
        plano: "assinante",
        plano_origem: "assinatura",
        ciclo_inicio: inicio.toISOString(),
        ciclo_fim: fim.toISOString(),
        plano_ate: (cancelada ? fim : new Date(fim.getTime() + TOLERANCIA_MS)).toISOString(),
      },
      pagamento: registro,
    };
  }
  // Recusada (o Mercado Pago tenta de novo por alguns dias): aviso na tela; o plano
  // segue até plano_ate (fim do ciclo + 5 dias).
  if (statusDoPagamento === "rejected" || cobranca.status === "recycling") {
    return {assinatura: {cobranca_falhou_em: assinatura.cobranca_falhou_em ?? agora.toISOString()}, pagamento: registro};
  }
  return {assinatura: {}, pagamento: registro};
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
  valor: number;
  // nenhuma: pode assinar; ativa: renova em renovaEm; cancelada: assinante até ate;
  // falhou: a cobrança falhou, assinante até ate (tolerância); cortesia: assinante
  // pelo npm run plano (sem cobrança).
  situacao: "nenhuma" | "ativa" | "cancelada" | "falhou" | "cortesia";
  renovaEm?: string;
  ate?: string;
};

export const resumoDaAssinatura = (
  perfil: PerfilDaAssinatura,
  assinatura: Assinatura | undefined,
  agora: Date,
  disponivel: boolean,
  valor: number,
): ResumoDaAssinatura => {
  const base = {disponivel, valor};
  const plano = planoEfetivo(perfil, agora);
  if (plano === "assinante" && perfil.plano_origem === "manual") return {...base, situacao: "cortesia"};
  if (plano !== "assinante") return {...base, situacao: "nenhuma"};
  const ate = perfil.plano_ate ?? undefined;
  if (assinatura?.status === "cancelada" || assinatura?.status === "pausada") return {...base, situacao: "cancelada", ate: perfil.ciclo_fim ?? ate};
  if (assinatura?.cobranca_falhou_em || (perfil.ciclo_fim && new Date(perfil.ciclo_fim) <= agora)) return {...base, situacao: "falhou", ate};
  return {...base, situacao: "ativa", renovaEm: perfil.ciclo_fim ?? undefined};
};

// ---------- processamento dos eventos ----------
export const processadorDeEventos = ({banco, api, agora = () => new Date()}: {banco: BancoDeAssinaturas; api: ApiDoMercadoPago; agora?: () => Date}) => {
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

  const daAssinatura = async (preapprovalId: string) => {
    const pre = await api.assinatura(preapprovalId);
    const assinatura = await assinaturaConferida(preapprovalId, pre);
    if (!assinatura) return "ignorado: assinatura desconhecida";
    const perfil = await banco.perfil(assinatura.usuario_id);
    const efeito = regraDaAssinatura(assinatura, pre, perfil, agora());
    await banco.salvarAssinatura(assinatura.id, efeito.assinatura);
    await aplicarNoPerfil(assinatura.usuario_id, efeito.perfil);
    return `assinatura ${efeito.assinatura.status}`;
  };

  const daCobranca = async (cobrancaId: string) => {
    const cobranca = await api.pagamentoAutorizado(cobrancaId);
    const pre = await api.assinatura(cobranca.preapproval_id).catch(() => undefined);
    const assinatura = await assinaturaConferida(cobranca.preapproval_id, pre);
    if (!assinatura) return "ignorado: assinatura desconhecida";
    const perfil = await banco.perfil(assinatura.usuario_id);
    const efeito = regraDaCobranca(assinatura, cobranca, pre, perfil, agora());
    if (efeito.pagamento) await banco.salvarPagamento({...efeito.pagamento, dados: cobranca});
    if (Object.keys(efeito.assinatura).length > 0) await banco.salvarAssinatura(assinatura.id, efeito.assinatura);
    await aplicarNoPerfil(assinatura.usuario_id, efeito.perfil);
    return `cobrança ${cobranca.payment?.status ?? cobranca.status}`;
  };

  const doPagamento = async (pagamentoId: string) => {
    const conhecido = await banco.pagamento(pagamentoId);
    // Só pagamentos de assinatura já registrados (vindos das cobranças).
    if (!conhecido) return "ignorado: pagamento desconhecido";
    const pagamento = await api.pagamento(pagamentoId);
    await banco.salvarPagamento({...conhecido, status: pagamento.status, dados: pagamento});
    const perfil = await banco.perfil(conhecido.usuario_id);
    const efeito = regraDoPagamento(pagamento, perfil, agora());
    if (!efeito.estornado) return `pagamento ${pagamento.status}`;
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

  return {receber, processar, processarPendentes};
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
      const {data, error} = await admin.from("perfis").select("plano, plano_origem, plano_ate, ciclo_inicio, ciclo_fim").eq("id", usuarioId).maybeSingle();
      falha("ler o perfil", error);
      return (data as PerfilDaAssinatura | null) ?? {plano: "gratis", plano_origem: "manual", plano_ate: null, ciclo_inicio: null, ciclo_fim: null};
    },
    salvarPerfil: async (usuarioId, campos) => {
      const {error} = await admin.from("perfis").update(campos).eq("id", usuarioId);
      falha("salvar o perfil", error);
    },
  };
};
