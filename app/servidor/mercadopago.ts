// Mercado Pago (Etapas 2c e 2d): a API de assinaturas (preapproval), o Pix avulso
// (POST /v1/payments) e a validação dos webhooks. Só no servidor: o token nunca sai daqui.
//   MERCADOPAGO_ACCESS_TOKEN     token da aplicação (de teste ou de produção)
//   MERCADOPAGO_WEBHOOK_SECRET   assinatura secreta dos webhooks (painel → Webhooks)
//   ASSINATURA_VALOR_BRL         preço mensal do Básico (padrão 30; os outros planos em planos.ts)
// Sem o token, não há assinatura: o botão "Assinar" não aparece e nada mais muda.
import {createHmac, timingSafeEqual} from "node:crypto";

const API = "https://api.mercadopago.com";

export type ConfigDoMercadoPago = {token: string; segredoDoWebhook?: string; valor: number};

export const mercadoPagoDoAmbiente = (): ConfigDoMercadoPago | undefined => {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) return undefined;
  const valor = Number(process.env.ASSINATURA_VALOR_BRL ?? 30);
  return {
    token,
    segredoDoWebhook: process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || undefined,
    valor: Number.isFinite(valor) && valor > 0 ? valor : 30,
  };
};

// ---------- respostas da API (só os campos usados) ----------
export type Preapproval = {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  external_reference?: string;
  init_point?: string;
  date_created?: string;
  last_modified?: string;
  next_payment_date?: string;
  payment_method_id?: string | null;
  auto_recurring?: {transaction_amount?: number; frequency?: number; frequency_type?: string; currency_id?: string; start_date?: string};
  // Resumo das cobranças feito pelo Mercado Pago (vale para qualquer meio de pagamento).
  summarized?: {
    charged_quantity?: number | null;
    pending_charge_quantity?: number | null;
    charged_amount?: number | null;
    semaphore?: string | null;
    last_charged_date?: string | null;
    last_charged_amount?: number | null;
  } | null;
};

// Cobrança de uma assinatura (GET /authorized_payments/{id}).
export type PagamentoAutorizado = {
  id: number | string;
  preapproval_id: string;
  // scheduled: agendada; processed: cobrada (aprovada ou recusada de vez);
  // recycling: recusada, o Mercado Pago tenta de novo; cancelled: cancelada.
  status: "scheduled" | "processed" | "recycling" | "cancelled" | string;
  transaction_amount?: number;
  date_created?: string;
  debit_date?: string;
  payment?: {id: number | string; status: string; status_detail?: string};
};

export type Pagamento = {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string;
  payment_method_id?: string;
  external_reference?: string | null;
  date_of_expiration?: string | null;
  // Pix: o código copia e cola e a imagem do QR code.
  point_of_interaction?: {transaction_data?: {qr_code?: string; qr_code_base64?: string}};
};

// Pedido de um Pix (Etapa 2d). O CPF só vai se o Mercado Pago exigir; nunca é guardado.
export type PedidoDePix = {
  // Id da linha em pix_pagamentos: vira o external_reference e a chave de idempotência.
  id: string;
  email: string;
  valor: number;
  expiraEm: Date;
  cpf?: string;
};

// "2026-10-08T12:30:00.000-03:00": a data no horário de Brasília, com o fuso (o
// formato dos exemplos do Mercado Pago).
export const dataDoMercadoPago = (data: Date): string =>
  `${new Date(data.getTime() - 3 * 3600_000).toISOString().slice(0, 23)}-03:00`;

// Tira de um texto qualquer coisa com cara de CPF (para mensagens de erro e o log):
// 11 dígitos soltos, com ou sem pontos e traço (os ids de pagamento têm 12 ou mais).
export const semCpf = (texto: string): string => texto.replace(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/gu, "[cpf]");

export type ApiDoMercadoPago = {
  // nome: o nome do plano, que aparece no checkout e na fatura ("Ascent Legendas - Pro").
  criarAssinatura: (pedido: {usuarioId: string; email: string; valor: number; nome: string; voltaPara: string}) => Promise<Preapproval>;
  // Troca o valor das próximas cobranças (descer de plano); a do ciclo pago não muda.
  alterarValorDaAssinatura: (id: string, valor: number) => Promise<Preapproval>;
  assinatura: (id: string) => Promise<Preapproval>;
  cancelarAssinatura: (id: string) => Promise<Preapproval>;
  pagamentoAutorizado: (id: string) => Promise<PagamentoAutorizado>;
  // As cobranças de uma assinatura (sem depender dos webhooks).
  cobrancasDaAssinatura: (preapprovalId: string) => Promise<PagamentoAutorizado[]>;
  pagamento: (id: string) => Promise<Pagamento>;
  criarPix: (pedido: PedidoDePix) => Promise<Pagamento>;
};

export const apiDoMercadoPago = (config: ConfigDoMercadoPago): ApiDoMercadoPago => {
  const chamar = async <T>(metodo: "GET" | "POST" | "PUT", caminho: string, corpo?: unknown, extras: Record<string, string> = {}): Promise<T> => {
    const resposta = await fetch(`${API}${caminho}`, {
      method: metodo,
      headers: {Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", ...extras},
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
      throw Object.assign(new Error(semCpf(`Mercado Pago ${metodo} ${caminho.split("?")[0]}: ${resposta.status} ${texto.slice(0, 300)}`)), {
        status: resposta.status,
      });
    }
    return JSON.parse(texto) as T;
  };
  return {
    // Assinatura sem plano associado, com pagamento pendente: a pessoa escolhe o
    // meio de pagamento no checkout do Mercado Pago (init_point).
    criarAssinatura: ({usuarioId, email, valor, nome, voltaPara}) =>
      chamar<Preapproval>("POST", "/preapproval", {
        reason: `Ascent Legendas - ${nome}`,
        external_reference: usuarioId,
        payer_email: email,
        auto_recurring: {frequency: 1, frequency_type: "months", transaction_amount: valor, currency_id: "BRL"},
        back_url: voltaPara,
        status: "pending",
      }),
    assinatura: (id) => chamar<Preapproval>("GET", `/preapproval/${encodeURIComponent(id)}`),
    cancelarAssinatura: (id) => chamar<Preapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, {status: "cancelled"}),
    alterarValorDaAssinatura: (id, valor) =>
      chamar<Preapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, {auto_recurring: {transaction_amount: valor, currency_id: "BRL"}}),
    pagamentoAutorizado: (id) => chamar<PagamentoAutorizado>("GET", `/authorized_payments/${encodeURIComponent(id)}`),
    cobrancasDaAssinatura: async (preapprovalId) =>
      (
        await chamar<{results?: PagamentoAutorizado[]}>(
          "GET",
          `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`,
        )
      ).results ?? [],
    pagamento: (id) => chamar<Pagamento>("GET", `/v1/payments/${encodeURIComponent(id)}`),
    // Pix avulso. A chave de idempotência é o id da linha: repetir o pedido não cria
    // um segundo Pix.
    criarPix: ({id, email, valor, expiraEm, cpf}) =>
      chamar<Pagamento>(
        "POST",
        "/v1/payments",
        {
          transaction_amount: valor,
          description: "Ascent Legendas - Assinante por 30 dias (Pix)",
          payment_method_id: "pix",
          external_reference: id,
          date_of_expiration: dataDoMercadoPago(expiraEm),
          payer: cpf ? {email, identification: {type: "CPF", number: cpf}} : {email},
        },
        {"X-Idempotency-Key": id},
      ),
  };
};

// ---------- webhook ----------
// Tempo máximo entre o ts da assinatura e a chegada: além disso, o aviso é recusado.
export const VALIDADE_DO_WEBHOOK_MS = 60 * 60 * 1000;

export type ResultadoDaValidacao = {valido: true} | {valido: false; motivo: string};

// x-signature: "ts=<timestamp>,v1=<hmac>". O texto assinado é
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (sem as partes que faltarem),
// com o data.id da URL em minúsculas; HMAC-SHA256 em hexadecimal com o segredo.
export const validarWebhook = ({
  assinatura,
  requestId,
  dataId,
  segredo,
  agora = Date.now(),
}: {
  assinatura: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  segredo: string | undefined;
  agora?: number;
}): ResultadoDaValidacao => {
  if (!segredo) return {valido: false, motivo: "sem MERCADOPAGO_WEBHOOK_SECRET"};
  if (!assinatura) return {valido: false, motivo: "sem x-signature"};
  const partes = Object.fromEntries(
    assinatura.split(",").map((parte) => {
      const [chave, ...valor] = parte.split("=");
      return [chave.trim(), valor.join("=").trim()];
    }),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return {valido: false, motivo: "x-signature sem ts ou v1"};
  // O ts pode vir em segundos ou em milissegundos.
  const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  if (!Number.isFinite(tsMs)) return {valido: false, motivo: "ts inválido"};
  if (Math.abs(agora - tsMs) > VALIDADE_DO_WEBHOOK_MS) return {valido: false, motivo: "ts antigo"};
  const id = dataId && /[a-z]/iu.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifesto = `${id ? `id:${id};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const esperado = createHmac("sha256", segredo).update(manifesto).digest("hex");
  const recebido = Buffer.from(v1, "utf8");
  const calculado = Buffer.from(esperado, "utf8");
  if (recebido.length !== calculado.length || !timingSafeEqual(recebido, calculado)) {
    return {valido: false, motivo: "assinatura não confere"};
  }
  return {valido: true};
};
