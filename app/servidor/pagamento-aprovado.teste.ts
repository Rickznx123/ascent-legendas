// npm run teste:assinaturas (junto com os da assinatura)
// O aviso de pagamento aprovado (Purchase da Meta e boas-vindas) sai uma vez por
// pagamento (cartão e Pix), e o e-mail de boas-vindas é montado com ou sem o grupo.
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {BancoDeAssinaturas, PagamentoDaAssinatura} from "./assinaturas";
import {montarBoasVindas} from "./boas-vindas";
import {cookieDoPedido} from "./meta";
import {assinaturasAoAprovar, pixAoAprovar} from "./pagamento-aprovado";
import type {PagamentoAprovado} from "./pagamento-aprovado";
import type {BancoDoPix, PixPagamento} from "./pix";

const CONTA = "33333333-3333-3333-3333-333333333333";

describe("pagamento aprovado", () => {
  it("cartão: só na primeira gravação aprovada, com o nível pelo valor", async () => {
    const pagamentos = new Map<string, PagamentoDaAssinatura>();
    const banco = {
      pagamento: async (id: string) => pagamentos.get(id),
      salvarPagamento: async (p: PagamentoDaAssinatura) => void pagamentos.set(p.mp_payment_id, p),
    } as unknown as BancoDeAssinaturas;
    const avisos: PagamentoAprovado[] = [];
    const comAviso = assinaturasAoAprovar(banco, (p) => avisos.push(p));
    const base = {mp_payment_id: "9", assinatura_id: "a", usuario_id: CONTA, valor: 49.9, pago_em: null};
    await comAviso.salvarPagamento({...base, status: "pending"});
    await comAviso.salvarPagamento({...base, status: "approved"});
    await comAviso.salvarPagamento({...base, status: "approved"});
    assert.deepEqual(avisos, [{usuarioId: CONTA, id: "compra-9", valor: 49.9, nivel: "pro"}]);
    assert.equal(pagamentos.get("9")?.status, "approved");
  });

  it("Pix: ao aprovar, com o valor e o nível da linha", async () => {
    const linha = {id: "p1", usuario_id: CONTA, valor: 30} as PixPagamento;
    const banco = {pixPorId: async () => linha, salvarPix: async () => undefined} as unknown as BancoDoPix;
    const avisos: PagamentoAprovado[] = [];
    const comAviso = pixAoAprovar(banco, (p) => avisos.push(p));
    await comAviso.salvarPix("p1", {status: "pendente"});
    await comAviso.salvarPix("p1", {status: "aprovado"});
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(avisos, [{usuarioId: CONTA, id: "pix-p1", valor: 30, nivel: "basico"}]);
  });

  it("um aviso que falha não quebra a gravação", async () => {
    const banco = {pagamento: async () => undefined, salvarPagamento: async () => undefined} as unknown as BancoDeAssinaturas;
    const comAviso = assinaturasAoAprovar(banco, () => {
      throw new Error("falhou");
    });
    await comAviso.salvarPagamento({mp_payment_id: "1", assinatura_id: "a", usuario_id: CONTA, valor: 30, pago_em: null, status: "approved"});
  });

  it("sem aviso, o banco é o mesmo", () => {
    const banco = {} as BancoDoPix;
    assert.equal(pixAoAprovar(banco, undefined), banco);
  });

  it("lê os cookies do Pixel", () => {
    assert.equal(cookieDoPedido("sessao=x; _fbp=fb.1.123.456; _fbc=fb.1.1.abc", "_fbp"), "fb.1.123.456");
    assert.equal(cookieDoPedido("sessao=x", "_fbc"), undefined);
  });
});

describe("e-mail de boas-vindas", () => {
  it("com nome e grupo", () => {
    const {html, texto} = montarBoasVindas({nome: "Ana <b>", plano: "Pro", minutos: 60, grupo: "https://chat.whatsapp.com/x"});
    assert.ok(texto.startsWith("Oi, Ana <b>!\n"));
    assert.ok(html.includes("Oi, Ana &lt;b&gt;!"));
    assert.ok(texto.includes("Seu plano Pro já está ativo, com 60 minutos"));
    assert.ok(html.includes("https://chat.whatsapp.com/x") && texto.includes("Entrar no grupo: https://chat.whatsapp.com/x"));
  });

  it("sem nome e sem grupo", () => {
    const {html, texto} = montarBoasVindas({nome: null, plano: "Básico", minutos: 30});
    assert.ok(texto.startsWith("Oi!\n"));
    assert.ok(!html.includes("WhatsApp") && !texto.includes("WhatsApp"));
    assert.ok(html.includes("Abrir o app"));
  });
});
