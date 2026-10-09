// npm run teste:assinaturas (junto com os da assinatura)
// Testes do Pix de 30 dias (Etapa 2d) sem credenciais: as regras e o processamento,
// com um banco em memória e respostas simuladas do Mercado Pago.
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {planoEfetivo, resumoDaAssinatura} from "./assinaturas";
import type {PerfilDaAssinatura} from "./assinaturas";
import {semCpf} from "./mercadopago";
import type {ApiDoMercadoPago, Pagamento, PedidoDePix} from "./mercadopago";
import {PERIODO_DO_PIX_MS, cicloDoPix, cpfValido, motivoParaNaoPagarPix, processadorDePix} from "./pix";
import type {BancoDoPix, PixPagamento} from "./pix";

const CONTA = "22222222-2222-2222-2222-222222222222";
const DIA = 24 * 3600 * 1000;
const GRATIS: PerfilDaAssinatura = {plano: "gratis", plano_origem: "manual", plano_ate: null, ciclo_inicio: null, ciclo_fim: null};

const montar = (perfilInicial: Partial<PerfilDaAssinatura> = {}) => {
  let relogio = new Date("2026-10-08T12:00:00Z");
  let perfil: PerfilDaAssinatura = {...GRATIS, ...perfilInicial};
  const linhas = new Map<string, PixPagamento>();
  const banco: BancoDoPix = {
    pixPorId: async (id) => (linhas.has(id) ? {...linhas.get(id)!} : undefined),
    pixPorPagamento: async (mp) => [...linhas.values()].find((l) => l.mp_payment_id === mp),
    ultimoPixDaConta: async (conta) => [...linhas.values()].filter((l) => l.usuario_id === conta).at(-1),
    criarPix: async ({id, usuario_id, valor, nivel}) => {
      const linha: PixPagamento = {
        id,
        usuario_id,
        valor,
        mp_payment_id: null,
        status: "criando",
        expira_em: null,
        qr_code: null,
        qr_code_base64: null,
        aprovado_em: null,
        periodo_inicio: null,
        periodo_fim: null,
        estornado_em: null,
        criado_em: relogio.toISOString(),
        nivel,
      };
      linhas.set(id, linha);
      return {...linha};
    },
    salvarPix: async (id, campos) => {
      linhas.set(id, {...linhas.get(id)!, ...campos});
    },
    pixAprovadosDesde: async (desde) => [...linhas.values()].filter((l) => l.status === "aprovado" && l.aprovado_em !== null && new Date(l.aprovado_em) >= desde),
    pixParaConferir: async (desde) =>
      [...linhas.values()].filter((l) => (l.status === "criando" || l.status === "pendente") && new Date(l.criado_em) >= desde),
    perfil: async () => perfil,
    salvarPerfil: async (_conta, campos) => {
      perfil = {...perfil, ...campos};
    },
  };
  // Mercado Pago simulado: cada Pix criado vira um pagamento pendente.
  const mp = {
    pagamentos: new Map<string, Pagamento>(),
    pedidos: [] as PedidoDePix[],
    falhaAoCriar: undefined as string | undefined,
    numero: 100,
  };
  const api = {
    pagamento: async (id: string) => {
      const p = mp.pagamentos.get(id);
      if (!p) throw new Error(`pagamento ${id} não existe`);
      return p;
    },
    criarPix: async (pedido: PedidoDePix) => {
      mp.pedidos.push(pedido);
      if (mp.falhaAoCriar && !(pedido.cpf && mp.falhaAoCriar.includes("identification"))) throw new Error(mp.falhaAoCriar);
      const id = String(++mp.numero);
      const pagamento: Pagamento = {
        id,
        status: "pending",
        payment_method_id: "pix",
        transaction_amount: pedido.valor,
        external_reference: pedido.id,
        date_of_expiration: pedido.expiraEm.toISOString(),
        point_of_interaction: {transaction_data: {qr_code: `000201-copia-e-cola-${id}`, qr_code_base64: "iVBOR"}},
      };
      mp.pagamentos.set(id, pagamento);
      return pagamento;
    },
  } as unknown as ApiDoMercadoPago;
  const registros: string[] = [];
  const pix = processadorDePix({banco, api, agora: () => relogio, registrar: (linha) => registros.push(linha)});
  const usuario = {id: CONTA, email: "pessoa@exemplo.com"};
  // O Mercado Pago muda o pagamento (aprovado, estornado, vencido).
  const mudar = (mpId: string, campos: Partial<Pagamento>) => mp.pagamentos.set(mpId, {...mp.pagamentos.get(mpId)!, ...campos});
  return {
    banco,
    mp,
    pix,
    usuario,
    linhas,
    registros,
    mudar,
    perfil: () => perfil,
    agora: () => relogio,
    avancar: (ms: number) => {
      relogio = new Date(relogio.getTime() + ms);
    },
    resumo: () => resumoDaAssinatura(perfil, undefined, relogio, true),
  };
};

describe("Pix: regras de cada caso", () => {
  it("aprovado: 30 dias de assinante a partir da aprovação, pelo webhook", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 30);
    assert.equal(gerado.status, "pendente");
    assert.ok(gerado.qr_code);
    assert.equal(t.perfil().plano, "gratis", "gerar o Pix não muda o plano");
    t.mudar(gerado.mp_payment_id!, {status: "approved", date_approved: "2026-10-08T12:05:00Z"});
    const resultado = await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.match(resultado!, /aprovado/u);
    const perfil = t.perfil();
    assert.equal(perfil.plano, "assinante");
    assert.equal(perfil.plano_origem, "pix");
    assert.equal(perfil.ciclo_inicio, "2026-10-08T12:05:00.000Z");
    assert.equal(perfil.plano_ate, new Date(new Date("2026-10-08T12:05:00Z").getTime() + PERIODO_DO_PIX_MS).toISOString());
    const {planos: _planos, ...resumo} = t.resumo();
    assert.deepEqual(resumo, {disponivel: true, valor: 30, nivel: "basico", situacao: "pix", ate: perfil.plano_ate!});
  });

  it("aprovado pela tela conferindo (sem webhook), e o mesmo aprovado de novo não soma", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 30);
    t.mudar(gerado.mp_payment_id!, {status: "approved", date_approved: "2026-10-08T12:01:00Z"});
    t.avancar(10_000);
    const conferido = await t.pix.conferir(CONTA);
    assert.equal(conferido?.status, "aprovado");
    const ate = t.perfil().plano_ate;
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.equal(t.perfil().plano_ate, ate, "o webhook depois da conferência não soma outro período");
  });

  it("vencido ou não pago: nada muda, e dá para gerar outro", async () => {
    const t = montar();
    const primeiro = await t.pix.gerar(t.usuario, 30);
    t.avancar(2 * 3600 * 1000);
    t.mudar(primeiro.mp_payment_id!, {status: "cancelled"});
    await t.pix.doPagamento(primeiro.mp_payment_id!);
    assert.equal(t.linhas.get(primeiro.id)!.status, "vencido");
    assert.equal(t.perfil().plano, "gratis");
    const segundo = await t.pix.gerar(t.usuario, 30);
    assert.notEqual(segundo.id, primeiro.id);
    assert.equal(segundo.status, "pendente");
  });

  it("gerar de novo dentro do prazo devolve o mesmo código (não cria outro Pix)", async () => {
    const t = montar();
    const primeiro = await t.pix.gerar(t.usuario, 30);
    t.avancar(10 * 60_000);
    const segundo = await t.pix.gerar(t.usuario, 30);
    assert.equal(segundo.id, primeiro.id);
    assert.equal(t.mp.pedidos.length, 1);
  });

  it("gerar de novo depois de pago: aplica o pago antes de criar outro", async () => {
    const t = montar();
    const primeiro = await t.pix.gerar(t.usuario, 30);
    t.mudar(primeiro.mp_payment_id!, {status: "approved", date_approved: "2026-10-08T12:02:00Z"});
    t.avancar(60_000);
    await t.pix.gerar(t.usuario, 30);
    assert.equal(t.linhas.get(primeiro.id)!.status, "aprovado");
    assert.equal(t.perfil().plano, "assinante");
  });

  it("soma de períodos: outro Pix antes do fim soma 30 dias ao fim; os minutos novos começam quando os atuais acabam", async () => {
    const t = montar();
    const primeiro = await t.pix.gerar(t.usuario, 30);
    t.mudar(primeiro.mp_payment_id!, {status: "approved", date_approved: "2026-10-08T12:00:00Z"});
    await t.pix.doPagamento(primeiro.mp_payment_id!);
    const fimDoPrimeiro = new Date(t.perfil().plano_ate!).getTime();
    t.avancar(25 * DIA);
    const segundo = await t.pix.gerar(t.usuario, 30);
    t.mudar(segundo.mp_payment_id!, {status: "approved", date_approved: t.agora().toISOString()});
    await t.pix.doPagamento(segundo.mp_payment_id!);
    assert.equal(new Date(t.perfil().plano_ate!).getTime(), fimDoPrimeiro + PERIODO_DO_PIX_MS);
    assert.equal(t.linhas.get(segundo.id)!.periodo_inicio, new Date(fimDoPrimeiro).toISOString());
    // Dia 25: ainda o primeiro ciclo de minutos.
    assert.equal(cicloDoPix(t.perfil(), t.agora())!.fim.getTime(), fimDoPrimeiro);
    // Dia 31: o segundo ciclo, que começa no fim do primeiro.
    t.avancar(6 * DIA);
    const ciclo = cicloDoPix(t.perfil(), t.agora())!;
    assert.equal(ciclo.inicio.getTime(), fimDoPrimeiro);
    assert.equal(ciclo.fim.getTime(), fimDoPrimeiro + PERIODO_DO_PIX_MS);
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "assinante");
  });

  it("Pix pago depois do fim: período novo a partir do pagamento (sem somar)", async () => {
    const t = montar();
    const primeiro = await t.pix.gerar(t.usuario, 30);
    t.mudar(primeiro.mp_payment_id!, {status: "approved", date_approved: "2026-10-08T12:00:00Z"});
    await t.pix.doPagamento(primeiro.mp_payment_id!);
    t.avancar(40 * DIA);
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "gratis", "acabou o período: grátis");
    assert.equal(t.resumo().situacao, "nenhuma");
    const segundo = await t.pix.gerar(t.usuario, 30);
    t.mudar(segundo.mp_payment_id!, {status: "approved", date_approved: t.agora().toISOString()});
    await t.pix.doPagamento(segundo.mp_payment_id!);
    assert.equal(t.perfil().ciclo_inicio, t.agora().toISOString());
    assert.equal(new Date(t.perfil().plano_ate!).getTime(), t.agora().getTime() + PERIODO_DO_PIX_MS);
  });

  it("estorno: grátis na hora", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 30);
    t.mudar(gerado.mp_payment_id!, {status: "approved", date_approved: "2026-10-08T12:00:00Z"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    t.avancar(3 * DIA);
    t.mudar(gerado.mp_payment_id!, {status: "refunded"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.equal(t.linhas.get(gerado.id)!.status, "estornado");
    assert.equal(t.perfil().plano, "gratis");
    assert.equal(planoEfetivo(t.perfil(), t.agora()), "gratis");
  });

  it("contestação (chargeback) também volta ao grátis", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 30);
    t.mudar(gerado.mp_payment_id!, {status: "approved"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    t.mudar(gerado.mp_payment_id!, {status: "charged_back"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.equal(t.perfil().plano, "gratis");
  });

  it("cortesia intocada: não vê o Pix e, se um Pix dela for aprovado, o plano não muda", async () => {
    const t = montar({plano: "assinante", plano_origem: "manual"});
    assert.equal(t.resumo().situacao, "cortesia");
    assert.ok(motivoParaNaoPagarPix(t.resumo()));
    const gerado = await t.pix.gerar(t.usuario, 30);
    t.mudar(gerado.mp_payment_id!, {status: "approved"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.deepEqual(t.perfil(), {...GRATIS, plano: "assinante", plano_origem: "manual"});
    t.mudar(gerado.mp_payment_id!, {status: "refunded"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.deepEqual(t.perfil(), {...GRATIS, plano: "assinante", plano_origem: "manual"}, "o estorno também não mexe");
  });

  it("cartão ativo: sem opção Pix (e um Pix aprovado por engano não mexe no plano)", async () => {
    const cartao = {plano: "assinante" as const, plano_origem: "assinatura" as const, plano_ate: "2026-11-12T12:00:00Z", ciclo_inicio: "2026-10-07T12:00:00Z", ciclo_fim: "2026-11-07T12:00:00Z"};
    const t = montar(cartao);
    assert.equal(t.resumo().situacao, "ativa");
    assert.match(motivoParaNaoPagarPix(t.resumo())!, /cartão/u);
    const gerado = await t.pix.gerar(t.usuario, 30);
    t.mudar(gerado.mp_payment_id!, {status: "approved"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.deepEqual(t.perfil(), cartao);
    assert.ok(t.registros.some((linha) => /cartão valendo/u.test(linha)), "fica no log para estornar à mão");
  });

  it("quem pode gerar Pix: o grátis e quem já está no Pix; cartão cancelado ainda valendo, não", () => {
    const base = {disponivel: true, valor: 30, planos: []};
    assert.equal(motivoParaNaoPagarPix({...base, situacao: "nenhuma"}), undefined);
    assert.equal(motivoParaNaoPagarPix({...base, situacao: "pix", ate: "2026-11-07T12:00:00Z"}), undefined);
    assert.ok(motivoParaNaoPagarPix({...base, situacao: "cancelada"}));
    assert.ok(motivoParaNaoPagarPix({...base, situacao: "falhou"}));
    assert.ok(motivoParaNaoPagarPix({disponivel: false, valor: 30, planos: [], situacao: "nenhuma"}));
  });
});

describe("Pix: Mercado Pago e dados do pagador", () => {
  it("webhook antes de o id ser gravado: acha o Pix pelo external_reference", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 30);
    t.linhas.set(gerado.id, {...t.linhas.get(gerado.id)!, mp_payment_id: null});
    t.mudar(gerado.mp_payment_id!, {status: "approved"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.equal(t.linhas.get(gerado.id)!.mp_payment_id, gerado.mp_payment_id);
    assert.equal(t.perfil().plano, "assinante");
  });

  it("pagamento que não é deste app: ignorado", async () => {
    const t = montar();
    t.mp.pagamentos.set("999", {id: "999", status: "approved", payment_method_id: "pix", external_reference: "outra-coisa"});
    assert.equal(await t.pix.doPagamento("999"), undefined);
    assert.equal(t.perfil().plano, "gratis");
  });

  it("valor menor que o do Pix: não ativa", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 30);
    t.mudar(gerado.mp_payment_id!, {status: "approved", transaction_amount: 1});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.equal(t.perfil().plano, "gratis");
  });

  it("CPF: pedido só quando o Mercado Pago exige; não vai para o banco nem para o log", async () => {
    const t = montar();
    t.mp.falhaAoCriar = 'Mercado Pago POST /v1/payments: 400 {"message":"payer.identification is required"}';
    await assert.rejects(t.pix.gerar(t.usuario, 30), (erro: {codigo?: string}) => erro.codigo === "cpf-necessario");
    assert.equal(t.mp.pedidos[0].cpf, undefined, "a primeira tentativa vai sem CPF");
    const gerado = await t.pix.gerar(t.usuario, 30, "52998224725");
    assert.equal(gerado.status, "pendente");
    assert.equal(t.mp.pedidos[1].cpf, "52998224725");
    const tudo = JSON.stringify([...t.linhas.values()]) + JSON.stringify(t.registros);
    assert.ok(!tudo.includes("52998224725"), "o CPF não fica em nenhuma linha nem no log");
  });

  it("outro erro do Mercado Pago: mensagem simples, sem pedir CPF", async () => {
    const t = montar();
    t.mp.falhaAoCriar = "Mercado Pago POST /v1/payments: 500 {}";
    await assert.rejects(t.pix.gerar(t.usuario, 30), (erro: {codigo?: string; message: string}) => erro.codigo === "falhou" && /Tente de novo/u.test(erro.message));
    assert.ok(t.registros.some((linha) => linha.includes("500")), "o detalhe fica no log");
  });

  it("filtro do log: tira CPF, mantém ids de pagamento", () => {
    assert.equal(semCpf("cpf 52998224725 e 529.982.247-25"), "cpf [cpf] e [cpf]");
    assert.equal(semCpf("GET /v1/payments/182915057892: 400"), "GET /v1/payments/182915057892: 400");
  });

  it("validação do CPF (formato e dígitos)", () => {
    assert.equal(cpfValido("529.982.247-25"), "52998224725");
    assert.equal(cpfValido("52998224724"), undefined);
    assert.equal(cpfValido("111.111.111-11"), undefined);
    assert.equal(cpfValido("1234"), undefined);
  });

  it("verificação periódica: aprova o Pix pago mesmo sem webhook nem tela aberta", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 30);
    t.mudar(gerado.mp_payment_id!, {status: "approved"});
    t.avancar(3 * 60_000);
    await t.pix.verificar();
    assert.equal(t.perfil().plano, "assinante");
  });
});

describe("Pix por plano (Básico, Pro e Editor)", () => {
  const pagar = async (t: ReturnType<typeof montar>, nivel: "basico" | "pro" | "editor", valor: number, quando: string) => {
    const gerado = await t.pix.gerar(t.usuario, valor, undefined, nivel);
    t.mudar(gerado.mp_payment_id!, {status: "approved", date_approved: quando});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    return gerado;
  };

  it("Pix do Pro aprovado: nível Pro por 30 dias", async () => {
    const t = montar();
    await pagar(t, "pro", 49.9, "2026-10-08T12:00:00Z");
    assert.equal(t.perfil().plano, "assinante");
    assert.equal(t.perfil().nivel, "pro");
    assert.equal(t.resumo().nivel, "pro");
  });

  it("valor pago menor que o do plano: não ativa", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 79.9, undefined, "editor");
    t.mudar(gerado.mp_payment_id!, {status: "approved", date_approved: "2026-10-08T12:00:00Z", transaction_amount: 30});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.equal(t.perfil().plano, "gratis");
  });

  it("subir no Pix: o Pix do Editor começa na hora (período e minutos novos)", async () => {
    const t = montar();
    await pagar(t, "basico", 30, "2026-10-08T12:00:00Z");
    t.avancar(10 * 24 * 3600 * 1000);
    await pagar(t, "editor", 79.9, "2026-10-18T12:00:00Z");
    assert.equal(t.perfil().nivel, "editor");
    assert.equal(t.perfil().ciclo_inicio, "2026-10-18T12:00:00.000Z");
    assert.equal(t.perfil().plano_ate, new Date(new Date("2026-10-18T12:00:00Z").getTime() + PERIODO_DO_PIX_MS).toISOString());
  });

  it("mesmo plano no Pix: os dias somam", async () => {
    const t = montar();
    await pagar(t, "pro", 49.9, "2026-10-08T12:00:00Z");
    const fim = t.perfil().plano_ate!;
    t.avancar(10 * 24 * 3600 * 1000);
    await pagar(t, "pro", 49.9, "2026-10-18T12:00:00Z");
    assert.equal(t.perfil().plano_ate, new Date(new Date(fim).getTime() + PERIODO_DO_PIX_MS).toISOString());
    assert.equal(t.perfil().nivel, "pro");
  });

  it("descer no Pix: só depois que o período atual acabar", async () => {
    const t = montar();
    await pagar(t, "editor", 79.9, "2026-10-08T12:00:00Z");
    assert.match(motivoParaNaoPagarPix(t.resumo(), "basico")!, /Editor até/u);
    assert.equal(motivoParaNaoPagarPix(t.resumo(), "editor"), undefined);
  });

  it("trocar de plano antes de pagar gera outro Pix (com o valor novo)", async () => {
    const t = montar();
    const basico = await t.pix.gerar(t.usuario, 30, undefined, "basico");
    const pro = await t.pix.gerar(t.usuario, 49.9, undefined, "pro");
    assert.notEqual(pro.id, basico.id);
    assert.equal(Number(pro.valor), 49.9);
  });
});

describe("Pix: estorno sem webhook", () => {
  it("a verificação periódica acha o Pix devolvido e volta para grátis", async () => {
    const t = montar();
    const gerado = await t.pix.gerar(t.usuario, 79.9, undefined, "editor");
    t.mudar(gerado.mp_payment_id!, {status: "approved", date_approved: "2026-10-08T12:00:00Z"});
    await t.pix.doPagamento(gerado.mp_payment_id!);
    assert.equal(t.perfil().plano, "assinante");
    t.avancar(3600_000);
    t.mudar(gerado.mp_payment_id!, {status: "refunded"});
    await t.pix.verificar();
    assert.equal(t.perfil().plano, "gratis");
  });
});
