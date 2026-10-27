import assert from "node:assert/strict";
import {test} from "node:test";
import {eventoDaTela} from "./eventos";

test("aceita só nomes da tela e dados planos e curtos", () => {
  assert.deepEqual(eventoDaTela({nome: "abriu_exportar"}), {nome: "abriu_exportar"});
  assert.equal(eventoDaTela({nome: "export_concluido"}), undefined);
  assert.equal(eventoDaTela({nome: "nada"}), undefined);
  assert.equal(eventoDaTela({nome: "trocou_estilo", dados: [1]}), undefined);
  const r = eventoDaTela({nome: "trocou_estilo", dados: {pacote: "x".repeat(500), n: 2, obj: {a: 1}}});
  assert.equal((r?.dados?.pacote as string).length, 200);
  assert.equal(r?.dados?.n, 2);
  assert.equal("obj" in (r?.dados ?? {}), false);
});
