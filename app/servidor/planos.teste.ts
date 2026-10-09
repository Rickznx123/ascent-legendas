// Planos pagos (migração 009): valores e minutos da configuração, o nível pelo valor
// cobrado e os minutos de cada nível na cota.
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {usoDoPlano} from "./cota";
import {compararNiveis, nivelPeloValor, planoPago, planosPagos} from "./planos";

describe("planos pagos", () => {
  it("padrões: Básico R$ 30 / 30 min, Pro R$ 49,90 / 60 min, Editor R$ 79,90 / 120 min", () => {
    const antes = {...process.env};
    for (const nome of ["ASSINATURA_VALOR_BRL", "PLANO_PRO_VALOR_BRL", "PLANO_EDITOR_VALOR_BRL", "PLANO_BASICO_MINUTOS", "PLANO_PRO_MINUTOS", "PLANO_EDITOR_MINUTOS"]) delete process.env[nome];
    assert.deepEqual(
      planosPagos().map(({nivel, valor, minutos}) => [nivel, valor, minutos]),
      [["basico", 30, 30], ["pro", 49.9, 60], ["editor", 79.9, 120]],
    );
    Object.assign(process.env, antes);
  });
  it("valores e minutos vêm do ambiente; valor inválido volta ao padrão", () => {
    process.env.PLANO_PRO_VALOR_BRL = "59,90";
    process.env.PLANO_EDITOR_MINUTOS = "abc";
    assert.equal(planoPago("pro").valor, 59.9);
    assert.equal(planoPago("editor").minutos, 120);
    delete process.env.PLANO_PRO_VALOR_BRL;
    delete process.env.PLANO_EDITOR_MINUTOS;
  });
  it("nível pelo valor cobrado; valor de nenhum plano não dá nível", () => {
    assert.equal(nivelPeloValor(30), "basico");
    assert.equal(nivelPeloValor(49.9), "pro");
    assert.equal(nivelPeloValor(79.9), "editor");
    assert.equal(nivelPeloValor(1), undefined);
    assert.equal(nivelPeloValor(undefined), undefined);
  });
  it("ordem dos níveis", () => {
    assert.equal(compararNiveis("pro", "basico"), 1);
    assert.equal(compararNiveis("basico", "editor"), -1);
    assert.equal(compararNiveis("pro", "pro"), 0);
  });
  it("a cota usa os minutos do nível", () => {
    const ciclo = {inicio: new Date("2026-10-07T12:00:00Z"), fim: new Date("2026-11-07T12:00:00Z")};
    const uso = usoDoPlano("assinante", [], new Date("2026-10-10T00:00:00Z"), ciclo, planoPago("editor").minutos * 60);
    assert.equal(uso.plano === "assinante" && uso.segundosDoPlano, 7200);
  });
});
