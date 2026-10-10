// npm run teste:assinaturas (junto com os da assinatura)
// O Purchase da Meta sai uma vez por pagamento aprovado (cartão e Pix), e uma falha da
// Meta não quebra a gravação do pagamento.
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import type {BancoDeAssinaturas, PagamentoDaAssinatura} from "./assinaturas";
import {assinaturasComMeta, cookieDoPedido, pixComMeta} from "./meta";
import type {Meta} from "./meta";
import type {BancoDoPix, PixPagamento} from "./pix";

const CONTA = "33333333-3333-3333-3333-333333333333";

const metaFalsa = () => {
  const compras: [string, string, number | null][] = [];
  const meta: Meta = {cadastro: async () => undefined, compra: async (...args) => void compras.push(args)};
  return {meta, compras};
};

describe("Purchase da Meta", () => {
  it("cartão: só na primeira gravação aprovada", async () => {
    const pagamentos = new Map<string, PagamentoDaAssinatura>();
    const banco = {
      pagamento: async (id: string) => pagamentos.get(id),
      salvarPagamento: async (p: PagamentoDaAssinatura) => void pagamentos.set(p.mp_payment_id, p),
    } as unknown as BancoDeAssinaturas;
    const {meta, compras} = metaFalsa();
    const comMeta = assinaturasComMeta(banco, meta);
    const base = {mp_payment_id: "9", assinatura_id: "a", usuario_id: CONTA, valor: 49, pago_em: null};
    await comMeta.salvarPagamento({...base, status: "pending"});
    await comMeta.salvarPagamento({...base, status: "approved"});
    await comMeta.salvarPagamento({...base, status: "approved"});
    assert.deepEqual(compras, [[CONTA, "compra-9", 49]]);
    assert.equal(pagamentos.get("9")?.status, "approved");
  });

  it("Pix: ao aprovar, com o valor da linha", async () => {
    const linha = {id: "p1", usuario_id: CONTA, valor: 30} as PixPagamento;
    const banco = {pixPorId: async () => linha, salvarPix: async () => undefined} as unknown as BancoDoPix;
    const {meta, compras} = metaFalsa();
    const comMeta = pixComMeta(banco, meta);
    await comMeta.salvarPix("p1", {status: "pendente"});
    await comMeta.salvarPix("p1", {status: "aprovado"});
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(compras, [[CONTA, "pix-p1", 30]]);
  });

  it("sem Meta, o banco é o mesmo", () => {
    const banco = {} as BancoDoPix;
    assert.equal(pixComMeta(banco, undefined), banco);
  });

  it("lê os cookies do Pixel", () => {
    assert.equal(cookieDoPedido("sessao=x; _fbp=fb.1.123.456; _fbc=fb.1.1.abc", "_fbp"), "fb.1.123.456");
    assert.equal(cookieDoPedido("sessao=x", "_fbc"), undefined);
  });
});
