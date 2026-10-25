// Cupons (migração 013): o código, a validade e o valor com desconto.
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {nivelCobrado} from "./assinaturas";
import type {Assinatura} from "./assinaturas";
import {codigoDoCupom, motivoDoCupom, valorComDesconto} from "./cupons";
import type {Cupom} from "./cupons";

const agora = new Date("2026-10-24T12:00:00Z");
const cupom: Cupom = {codigo: "BEMVINDO20", percentual: 20, so_primeiro_mes: true, valido_ate: null, max_usos: null, usos: 0, ativo: true};

describe("cupons", () => {
  it("código sem diferenciar maiúscula; fora do formato não vale", () => {
    assert.equal(codigoDoCupom(" bemVindo20 "), "BEMVINDO20");
    assert.equal(codigoDoCupom(""), undefined);
    assert.equal(codigoDoCupom("50%OFF"), undefined);
    assert.equal(codigoDoCupom(undefined), undefined);
  });
  it("inválido, inativo, vencido e esgotado", () => {
    assert.equal(motivoDoCupom(cupom, agora), undefined);
    assert.match(motivoDoCupom(undefined, agora)!, /inválido/u);
    assert.match(motivoDoCupom({...cupom, ativo: false}, agora)!, /inválido/u);
    assert.match(motivoDoCupom({...cupom, valido_ate: "2026-10-24T11:59:59Z"}, agora)!, /venceu/u);
    assert.equal(motivoDoCupom({...cupom, valido_ate: "2026-10-25T00:00:00Z"}, agora), undefined);
    assert.match(motivoDoCupom({...cupom, max_usos: 10, usos: 10}, agora)!, /esgotou/u);
    assert.equal(motivoDoCupom({...cupom, max_usos: 10, usos: 9}, agora), undefined);
  });
  it("valor com desconto em centavos", () => {
    assert.equal(valorComDesconto(49.9, 20), 39.92);
    assert.equal(valorComDesconto(30, 50), 15);
    assert.equal(valorComDesconto(79.9, 15), 67.92);
  });
  it("nível de uma cobrança com desconto: o da assinatura com cupom, se o valor é o dela", () => {
    const assinatura = {nivel: "pro", valor: 39.92, cupom_codigo: "BEMVINDO20"} as Assinatura;
    assert.equal(nivelCobrado(39.92, assinatura), "pro");
    assert.equal(nivelCobrado(49.9, assinatura), "pro");
    assert.equal(nivelCobrado(30, assinatura), "basico");
    assert.equal(nivelCobrado(12.34, assinatura), undefined);
    assert.equal(nivelCobrado(39.92, {...assinatura, cupom_codigo: null}), undefined);
  });
});
