// npm run teste:assinaturas
// Testes da assinatura (Etapa 2c) sem credenciais: a validação do webhook e as regras
// de cada caso, com um banco em memória e respostas simuladas do Mercado Pago.
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {describe, it} from "node:test";
import {TOLERANCIA_MS, planoEfetivo, processadorDeEventos, resumoDaAssinatura} from "./assinaturas";
import type {Assinatura, BancoDeAssinaturas, Evento, PagamentoDaAssinatura, PerfilDaAssinatura} from "./assinaturas";
import {usoDoPlano} from "./cota";
import {VALIDADE_DO_WEBHOOK_MS, validarWebhook} from "./mercadopago";
import type {ApiDoMercadoPago, Pagamento, PagamentoAutorizado, Preapproval} from "./mercadopago";

// ---------- webhook ----------
const SEGREDO = "segredo-de-teste";
const assinar = (manifesto: string, segredo = SEGREDO) => createHmac("sha256", segredo).update(manifesto).digest("hex");

describe("validação do x-signature", () => {
  const agora = Date.UTC(2026, 9, 7, 12, 0, 0);
  const ts = String(Math.floor(agora / 1000));
  const cabecalho = (v1: string, t = ts) => `ts=${t},v1=${v1}`;

  it("aceita a assinatura certa (id, request-id e ts)", () => {
    const v1 = assinar(`id:123456;request-id:req-1;ts:${ts};`);
    assert.deepEqual(validarWebhook({assinatura: cabecalho(v1), requestId: "req-1", dataId: "123456", segredo: SEGREDO, agora}), {valido: true});
  });
  it("aceita com espaços no cabeçalho e o ts em milissegundos", () => {
    const tsMs = String(agora);
    const v1 = assinar(`id:123456;request-id:req-1;ts:${tsMs};`);
    assert.equal(validarWebhook({assinatura: `ts=${tsMs}, v1=${v1}`, requestId: "req-1", dataId: "123456", segredo: SEGREDO, agora}).valido, true);
  });
  it("usa o data.id em minúsculas quando ele tem letras", () => {
    const v1 = assinar(`id:abc123;request-id:req-1;ts:${ts};`);
    assert.equal(validarWebhook({assinatura: cabecalho(v1), requestId: "req-1", dataId: "ABC123", segredo: SEGREDO, agora}).valido, true);
  });
  it("monta o texto sem as partes que faltam", () => {
    const v1 = assinar(`id:123456;ts:${ts};`);
    assert.equal(validarWebhook({assinatura: cabecalho(v1), requestId: undefined, dataId: "123456", segredo: SEGREDO, agora}).valido, true);
  });
  it("recusa outro id (assinatura de outro evento)", () => {
    const v1 = assinar(`id:123456;request-id:req-1;ts:${ts};`);
    assert.deepEqual(validarWebhook({assinatura: cabecalho(v1), requestId: "req-1", dataId: "999", segredo: SEGREDO, agora}), {valido: false, motivo: "assinatura não confere"});
  });
  it("recusa o segredo errado", () => {
    const v1 = assinar(`id:123456;request-id:req-1;ts:${ts};`, "outro-segredo");
    assert.equal(validarWebhook({assinatura: cabecalho(v1), requestId: "req-1", dataId: "123456", segredo: SEGREDO, agora}).valido, false);
  });
  it("recusa ts antigo, mesmo com a assinatura certa", () => {
    const velho = String(Math.floor((agora - VALIDADE_DO_WEBHOOK_MS - 60_000) / 1000));
    const v1 = assinar(`id:123456;request-id:req-1;ts:${velho};`);
    assert.deepEqual(validarWebhook({assinatura: cabecalho(v1, velho), requestId: "req-1", dataId: "123456", segredo: SEGREDO, agora}), {valido: false, motivo: "ts antigo"});
  });
  it("recusa sem cabeçalho, sem v1 e sem segredo configurado", () => {
    assert.equal(validarWebhook({assinatura: undefined, requestId: "r", dataId: "1", segredo: SEGREDO, agora}).valido, false);
    assert.equal(validarWebhook({assinatura: `ts=${ts}`, requestId: "r", dataId: "1", segredo: SEGREDO, agora}).valido, false);
    assert.equal(validarWebhook({assinatura: cabecalho("x"), requestId: "r", dataId: "1", segredo: undefined, agora}).valido, false);
  });
});

// ---------- banco em memória e Mercado Pago simulado ----------
const CONTA = "11111111-1111-1111-1111-111111111111";
const PRE = "pre-1";

const montar = (perfilInicial: Partial<PerfilDaAssinatura> = {}, assinaturaInicial: Partial<Assinatura> = {}) => {
  let relogio = new Date("2026-10-07T12:00:00Z");
  const eventos = new Map<string, Evento & {processado: boolean}>();
  const assinaturas = new Map<string, Assinatura>();
  const pagamentos = new Map<string, PagamentoDaAssinatura>();
  let perfil: PerfilDaAssinatura = {plano: "gratis", plano_origem: "manual", plano_ate: null, ciclo_inicio: null, ciclo_fim: null, ...perfilInicial};
  assinaturas.set("a1", {
    id: "a1",
    usuario_id: CONTA,
    mp_preapproval_id: PRE,
    status: "pendente",
    valor: 30,
    init_point: "https://mp/checkout",
    pago_ate: null,
    proxima_cobranca: null,
    cobranca_falhou_em: null,
    cancelada_em: null,
    estornada_em: null,
    criado_em: relogio.toISOString(),
    ...assinaturaInicial,
  });
  const banco: BancoDeAssinaturas = {
    novoEvento: async (e) => {
      if (eventos.has(e.request_id)) return false;
      eventos.set(e.request_id, {...e, tentativas: 0, processado: false});
      return true;
    },
    eventosPendentes: async () => [...eventos.values()].filter((e) => !e.processado),
    marcarEvento: async (id, {processado, tentativas}) => {
      const e = eventos.get(id)!;
      e.processado = processado;
      e.tentativas = tentativas;
    },
    assinaturaPorPreapproval: async (id) => [...assinaturas.values()].find((a) => a.mp_preapproval_id === id),
    assinaturaDaConta: async (conta) => [...assinaturas.values()].filter((a) => a.usuario_id === conta).at(-1),
    criarAssinatura: async (linha) => {
      const nova = {...linha, id: `a${assinaturas.size + 1}`, criado_em: relogio.toISOString(), pago_ate: null, proxima_cobranca: null, cobranca_falhou_em: null, cancelada_em: null, estornada_em: null};
      assinaturas.set(nova.id, nova);
      return nova;
    },
    salvarAssinatura: async (id, campos) => {
      assinaturas.set(id, {...assinaturas.get(id)!, ...campos});
    },
    pagamento: async (id) => pagamentos.get(id),
    salvarPagamento: async ({dados: _dados, ...p}) => {
      pagamentos.set(p.mp_payment_id, p);
    },
    perfil: async () => perfil,
    salvarPerfil: async (_conta, campos) => {
      perfil = {...perfil, ...campos};
    },
    assinaturasParaConferir: async ({pendentesDe, pendentesAte, cobrancaDe, cobrancaAte}) =>
      [...assinaturas.values()].filter((a) =>
        a.status === "pendente"
          ? new Date(a.criado_em) >= pendentesDe && new Date(a.criado_em) <= pendentesAte
          : a.status === "autorizada" && a.proxima_cobranca !== null && new Date(a.proxima_cobranca) >= cobrancaDe && new Date(a.proxima_cobranca) <= cobrancaAte,
      ),
  };
  // Respostas simuladas do Mercado Pago (o teste troca conforme o caso).
  const mp = {
    pre: {id: PRE, status: "authorized", external_reference: CONTA, next_payment_date: "2026-11-07T12:00:00Z"} as Preapproval,
    cobrancas: new Map<string, PagamentoAutorizado>(),
    pagamentos: new Map<string, Pagamento>(),
    canceladas: [] as string[],
    // GET /authorized_payments/search e outras assinaturas (por id).
    busca: [] as PagamentoAutorizado[],
    porId: new Map<string, Preapproval>(),
    consultas: [] as string[],
  };
  const api: ApiDoMercadoPago = {
    criarAssinatura: async () => mp.pre,
    assinatura: async (id) => {
      mp.consultas.push(id);
      return mp.porId.get(id) ?? mp.pre;
    },
    cancelarAssinatura: async (id) => {
      mp.canceladas.push(id);
      mp.pre = {...mp.pre, status: "cancelled"};
      return mp.pre;
    },
    pagamentoAutorizado: async (id) => {
      const c = mp.cobrancas.get(id);
      if (!c) throw new Error(`cobrança ${id} não existe`);
      return c;
    },
    cobrancasDaAssinatura: async (id) => mp.busca.filter((c) => c.preapproval_id === id),
    pagamento: async (id) => mp.pagamentos.get(id)!,
  };
  const processador = processadorDeEventos({banco, api, agora: () => relogio});
  let numero = 0;
  // Um webhook já validado chegando, e o processamento dos pendentes.
  const webhook = async (tipo: string, dataId: string, requestId = `req-${++numero}`) => {
    const recebido = await processador.receber({request_id: requestId, tipo, data_id: dataId});
    const resultados = await processador.processarPendentes();
    return {recebido, resultados};
  };
  return {
    banco,
    mp,
    processador,
    webhook,
    perfil: () => perfil,
    assinatura: () => assinaturas.get("a1")!,
    pagamentos,
    eventos,
    avancar: (dias: number) => {
      relogio = new Date(relogio.getTime() + dias * 24 * 3600 * 1000);
    },
    agora: () => relogio,
    resumo: () => resumoDaAssinatura(perfil, assinaturas.get("a1"), relogio, true, 30),
  };
};

const cobranca = (id: string, status: string, pagamento: string, data = "2026-10-07T12:00:00Z"): PagamentoAutorizado => ({
  id,
  preapproval_id: PRE,
  status: status === "approved" ? "processed" : "recycling",
  transaction_amount: 30,
  date_created: data,
  debit_date: data,
  payment: {id: pagamento, status},
});

describe("evento repetido", () => {
  it("guarda uma vez só e processa uma vez só", async () => {
    const t = montar();
    t.mp.cobrancas.set("c1", cobranca("c1", "approved", "p1"));
    const primeiro = await t.webhook("subscription_authorized_payment", "c1", "req-igual");
    const segundo = await t.webhook("subscription_authorized_payment", "c1", "req-igual");
    assert.equal(primeiro.recebido, "novo");
    assert.equal(segundo.recebido, "repetido");
    assert.equal(segundo.resultados.length, 0);
    assert.equal(t.pagamentos.size, 1);
  });
  it("um evento que falhou fica pendente e é tentado de novo", async () => {
    const t = montar();
    const {resultados} = await t.webhook("subscription_authorized_payment", "nao-existe", "req-falha");
    assert.match(resultados[0], /erro/u);
    assert.equal(t.eventos.get("req-falha")!.processado, false);
    t.mp.cobrancas.set("nao-existe", cobranca("nao-existe", "approved", "p9"));
    const de_novo = await (async () => {
      const r = await t.webhook("tipo-qualquer", "x");
      return r.resultados;
    })();
    assert.ok(de_novo.some((linha) => linha.includes("nao-existe") && linha.includes("approved")));
    assert.equal(t.eventos.get("req-falha")!.processado, true);
  });
});

describe("regras de cada caso", () => {
  it("aprovado: assinante, ciclo até a próxima cobrança, vale até o fim do ciclo + 5 dias", async () => {
    const t = montar();
    await t.webhook("subscription_preapproval", PRE);
    assert.equal(t.assinatura().status, "autorizada");
    assert.equal(t.perfil().plano, "gratis", "autorizar sem pagamento ainda não faz assinante");
    t.mp.cobrancas.set("c1", cobranca("c1", "approved", "p1"));
    await t.webhook("subscription_authorized_payment", "c1");
    const perfil = t.perfil();
    assert.equal(perfil.plano, "assinante");
    assert.equal(perfil.plano_origem, "assinatura");
    assert.equal(perfil.ciclo_inicio, "2026-10-07T12:00:00.000Z");
    assert.equal(perfil.ciclo_fim, "2026-11-07T12:00:00.000Z");
    assert.equal(new Date(perfil.plano_ate!).getTime(), new Date("2026-11-07T12:00:00Z").getTime() + TOLERANCIA_MS);
    assert.deepEqual(t.resumo(), {disponivel: true, valor: 30, situacao: "ativa", renovaEm: "2026-11-07T12:00:00.000Z"});
  });

  it("os 30 minutos contam pelo ciclo da assinatura", () => {
    const historico = [
      {projeto_id: "x", duracao_s: 60, descontado_s: 600, criado_em: "2026-10-01T00:00:00Z"},
      {projeto_id: "y", duracao_s: 60, descontado_s: 120, criado_em: "2026-10-08T00:00:00Z"},
    ];
    const uso = usoDoPlano("assinante", historico, new Date("2026-10-10T00:00:00Z"), {inicio: new Date("2026-10-07T12:00:00Z"), fim: new Date("2026-11-07T12:00:00Z")});
    assert.equal(uso.plano === "assinante" && uso.segundosUsados, 120);
    assert.equal(uso.plano === "assinante" && uso.renovaEm, "2026-11-07T12:00:00.000Z");
  });

  it("recusado na primeira cobrança: continua grátis, sem aviso de assinante", async () => {
    const t = montar();
    t.mp.pre = {...t.mp.pre, status: "pending"};
    t.mp.cobrancas.set("c1", cobranca("c1", "rejected", "p1"));
    await t.webhook("subscription_authorized_payment", "c1");
    assert.equal(t.perfil().plano, "gratis");
    assert.ok(t.assinatura().cobranca_falhou_em);
    assert.equal(t.resumo().situacao, "nenhuma");
  });

  it("cobrança mensal que falha: aviso e 5 dias de tolerância, depois grátis; volta com o pagamento", async () => {
    const t = montar();
    t.mp.cobrancas.set("c1", cobranca("c1", "approved", "p1"));
    await t.webhook("subscription_authorized_payment", "c1");
    t.avancar(31); // passou do fim do ciclo (07/11)
    t.mp.cobrancas.set("c2", cobranca("c2", "rejected", "p2", "2026-11-07T12:00:00Z"));
    await t.webhook("subscription_authorized_payment", "c2");
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "assinante", "na tolerância");
    assert.equal(t.resumo().situacao, "falhou");
    t.avancar(5); // 12/11 + 1 dia de folga: passou dos 5 dias
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "gratis");
    assert.equal(t.resumo().situacao, "nenhuma");
    // O cartão foi atualizado e a nova tentativa passou: assinante de novo, aviso some.
    t.mp.pre = {...t.mp.pre, next_payment_date: "2026-12-13T12:00:00Z"};
    t.mp.cobrancas.set("c3", cobranca("c3", "approved", "p3", "2026-11-13T12:00:00Z"));
    await t.webhook("subscription_authorized_payment", "c3");
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "assinante");
    assert.equal(t.assinatura().cobranca_falhou_em, null);
    assert.equal(t.perfil().ciclo_inicio, "2026-11-13T12:00:00.000Z");
  });

  it("cancelamento: assinante até o fim do ciclo pago, sem tolerância", async () => {
    const t = montar();
    t.mp.cobrancas.set("c1", cobranca("c1", "approved", "p1"));
    await t.webhook("subscription_authorized_payment", "c1");
    t.avancar(10);
    t.mp.pre = {...t.mp.pre, status: "cancelled"};
    await t.webhook("subscription_preapproval", PRE);
    assert.equal(t.assinatura().status, "cancelada");
    assert.equal(t.perfil().plano_ate, "2026-11-07T12:00:00.000Z");
    assert.deepEqual(t.resumo(), {disponivel: true, valor: 30, situacao: "cancelada", ate: "2026-11-07T12:00:00.000Z"});
    t.avancar(21); // 07/11 + 1 dia
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "gratis");
  });

  it("estorno (ou arrependimento em 7 dias): grátis na hora e a assinatura é cancelada no Mercado Pago", async () => {
    const t = montar();
    t.mp.cobrancas.set("c1", cobranca("c1", "approved", "p1"));
    await t.webhook("subscription_authorized_payment", "c1");
    t.avancar(3);
    t.mp.pagamentos.set("p1", {id: "p1", status: "refunded"});
    await t.webhook("payment", "p1");
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "gratis");
    assert.deepEqual(t.mp.canceladas, [PRE]);
    assert.equal(t.assinatura().status, "cancelada");
    assert.ok(t.assinatura().estornada_em);
    assert.equal(t.pagamentos.get("p1")!.status, "refunded");
  });

  it("chargeback também volta a grátis", async () => {
    const t = montar();
    t.mp.cobrancas.set("c1", cobranca("c1", "approved", "p1"));
    await t.webhook("subscription_authorized_payment", "c1");
    t.mp.pagamentos.set("p1", {id: "p1", status: "charged_back"});
    await t.webhook("payment", "p1");
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "gratis");
  });

  it("assinante pelo npm run plano (cortesia): os webhooks não mexem no plano", async () => {
    const t = montar({plano: "assinante", plano_origem: "manual"});
    t.mp.pre = {...t.mp.pre, status: "cancelled"};
    await t.webhook("subscription_preapproval", PRE);
    assert.deepEqual(t.perfil(), {plano: "assinante", plano_origem: "manual", plano_ate: null, ciclo_inicio: null, ciclo_fim: null});
    assert.equal(t.resumo().situacao, "cortesia");
    t.avancar(400);
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "assinante");
  });

  it("evento fora de ordem: um pagamento antigo não volta o ciclo", async () => {
    const t = montar();
    t.mp.pre = {...t.mp.pre, next_payment_date: "2026-12-07T12:00:00Z"};
    t.mp.cobrancas.set("c2", cobranca("c2", "approved", "p2", "2026-11-07T12:00:00Z"));
    await t.webhook("subscription_authorized_payment", "c2");
    t.mp.cobrancas.set("c1", cobranca("c1", "approved", "p1", "2026-10-07T12:00:00Z"));
    await t.webhook("subscription_authorized_payment", "c1");
    assert.equal(t.perfil().ciclo_inicio, "2026-11-07T12:00:00.000Z");
    assert.equal(t.pagamentos.size, 2);
  });

  it("assinatura de outra conta (external_reference diferente) ou desconhecida: ignorada", async () => {
    const t = montar();
    t.mp.pre = {...t.mp.pre, external_reference: "outra-conta"};
    const outra = await t.webhook("subscription_preapproval", PRE);
    assert.match(outra.resultados[0], /ignorado/u);
    const desconhecida = await t.webhook("payment", "p-que-nao-e-de-assinatura");
    assert.match(desconhecida.resultados[0], /ignorado/u);
    assert.equal(t.perfil().plano, "gratis");
  });
});

// Saldo em conta: a assinatura fica "authorized" e o Mercado Pago resume a cobrança
// (summarized), sem que chegue nenhum evento de pagamento.
const pago = (pre: Preapproval): Preapproval => ({
  ...pre,
  status: "authorized",
  payment_method_id: "account_money",
  summarized: {charged_quantity: 1, pending_charge_quantity: 0, charged_amount: 30, semaphore: "green", last_charged_date: "2026-10-07T03:20:00Z", last_charged_amount: 30},
});

describe("ativação pela consulta (sem o evento de pagamento)", () => {
  it("authorized sem evento de pagamento, com a cobrança em dia: assinante", async () => {
    const t = montar();
    t.mp.pre = pago(t.mp.pre);
    const resultado = await t.processador.sincronizar(t.assinatura());
    assert.match(resultado, /ativado/u);
    assert.equal(t.perfil().plano, "assinante");
    assert.equal(t.perfil().plano_origem, "assinatura");
    assert.equal(t.perfil().ciclo_inicio, "2026-10-07T03:20:00.000Z");
    assert.equal(t.perfil().ciclo_fim, "2026-11-07T12:00:00.000Z");
    assert.equal(t.perfil().plano_ate, new Date(new Date("2026-11-07T12:00:00Z").getTime() + TOLERANCIA_MS).toISOString());
    assert.equal(t.assinatura().status, "autorizada");
    assert.equal(t.resumo().situacao, "ativa");
    // Consultar de novo não muda nada.
    const antes = t.perfil();
    await t.processador.sincronizar(t.assinatura());
    assert.deepEqual(t.perfil(), antes);
  });

  it("o simulador (cobrança com o id da assinatura) consulta a assinatura em vez de falhar", async () => {
    const t = montar();
    t.mp.pre = pago(t.mp.pre);
    const {resultados} = await t.webhook("subscription_authorized_payment", PRE);
    assert.doesNotMatch(resultados[0], /erro/u);
    assert.equal(t.perfil().plano, "assinante");
  });

  it("a cobrança aprovada achada na busca ativa o plano e fica registrada", async () => {
    const t = montar();
    t.mp.busca = [cobranca("c1", "approved", "p1")];
    await t.processador.sincronizar(t.assinatura());
    assert.equal(t.perfil().plano, "assinante");
    assert.equal(t.pagamentos.get("p1")?.status, "approved");
  });

  it("sem cobrança, com semáforo vermelho, pendente ou de outra conta: continua grátis", async () => {
    for (const pre of [
      {id: PRE, status: "authorized", external_reference: CONTA, summarized: {charged_quantity: 0, semaphore: "green"}},
      {...pago({id: PRE, status: "authorized", external_reference: CONTA}), summarized: {charged_quantity: 1, semaphore: "red"}},
      {...pago({id: PRE, status: "authorized", external_reference: CONTA}), status: "pending"},
      pago({id: PRE, status: "authorized", external_reference: "outra-conta"}),
    ] as Preapproval[]) {
      const t = montar();
      t.mp.pre = pre;
      await t.processador.sincronizar(t.assinatura());
      assert.equal(t.perfil().plano, "gratis", JSON.stringify(pre));
    }
  });

  it("cortesia (npm run plano) não é tocada pela consulta sem assinatura", async () => {
    const t = montar({plano: "assinante", plano_origem: "manual"});
    assert.equal(await t.processador.confirmarDaConta("conta-sem-assinatura"), "sem assinatura para confirmar");
    assert.equal(t.perfil().plano_origem, "manual");
  });
});

describe("confirmação no retorno do checkout", () => {
  it("consulta a assinatura da conta e ativa, mesmo sem webhook", async () => {
    const t = montar();
    t.mp.pre = pago(t.mp.pre);
    await t.processador.confirmarDaConta(CONTA);
    assert.equal(t.perfil().plano, "assinante");
    assert.equal(t.resumo().situacao, "ativa");
  });

  it("no máximo uma consulta a cada 5 segundos por assinatura", async () => {
    const t = montar();
    await t.processador.confirmarDaConta(CONTA);
    assert.equal(await t.processador.confirmarDaConta(CONTA), "consultada há pouco");
    assert.equal(t.mp.consultas.length, 1);
  });
});

describe("verificação periódica", () => {
  it("pendente há mais de 2 minutos é consultada e ativa", async () => {
    const t = montar();
    t.mp.pre = pago(t.mp.pre);
    assert.deepEqual(await t.processador.verificarAssinaturas(), []);
    t.avancar(3 / (24 * 60));
    const resultados = await t.processador.verificarAssinaturas();
    assert.equal(resultados.length, 1);
    assert.equal(t.perfil().plano, "assinante");
  });

  it("até 5 por rodada, e cada uma no máximo a cada 10 minutos", async () => {
    const t = montar();
    for (let i = 0; i < 7; i++) {
      const nova = await t.banco.criarAssinatura({usuario_id: `conta-${i}`, mp_preapproval_id: `pre-x${i}`, status: "pendente", valor: 30, init_point: null});
      t.mp.porId.set(nova.mp_preapproval_id, {id: nova.mp_preapproval_id, status: "pending", external_reference: `conta-${i}`});
    }
    t.mp.porId.set(PRE, {id: PRE, status: "pending", external_reference: CONTA});
    t.avancar(5 / (24 * 60));
    assert.equal((await t.processador.verificarAssinaturas()).length, 5);
    assert.equal((await t.processador.verificarAssinaturas()).length, 3);
    assert.equal((await t.processador.verificarAssinaturas()).length, 0);
    assert.equal(t.mp.consultas.length, 8);
    t.avancar(11 / (24 * 60));
    assert.equal((await t.processador.verificarAssinaturas()).length, 5);
  });

  it("ativa perto da cobrança é consultada; longe da cobrança, não", async () => {
    const t = montar({}, {status: "autorizada", proxima_cobranca: "2026-11-07T12:00:00Z"});
    assert.deepEqual(await t.processador.verificarAssinaturas(), []);
    t.avancar(30.5);
    assert.equal((await t.processador.verificarAssinaturas()).length, 1);
    assert.deepEqual(t.mp.consultas, [PRE]);
  });
});
