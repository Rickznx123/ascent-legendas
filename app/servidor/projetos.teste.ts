// npx tsx --test app/servidor/projetos.teste.ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {timelineDe, timelineValida} from "./projetos";

test("projeto antigo vira 1 trecho com o vídeo inteiro", () => {
  assert.deepEqual(timelineDe({video: "a.mp4", timeline: null}), {trechos: [{id: "t1", video: "a.mp4", inicioMs: 0}]});
  assert.deepEqual(timelineDe({video: null, timeline: null}), {trechos: []});
});

test("timeline válida passa só com os campos esperados", () => {
  const t = timelineValida({trechos: [{id: "a1", video: "a.mp4", inicioMs: 0, fimMs: 500, extra: 1}, {id: "b2", video: "b.mp4", inicioMs: 10}]});
  assert.deepEqual(t, {trechos: [{id: "a1", video: "a.mp4", inicioMs: 0, fimMs: 500}, {id: "b2", video: "b.mp4", inicioMs: 10}]});
});

test("timeline inválida é recusada", () => {
  for (const ruim of [null, {}, {trechos: "x"}, {trechos: [{id: "a", video: "a.mp4", inicioMs: -1}]}, {trechos: [{id: "a", video: "a.mp4", inicioMs: 5, fimMs: 5}]}, {trechos: [{id: "a b", video: "a.mp4", inicioMs: 0}]}]) {
    assert.throws(() => timelineValida(ruim), /Timeline inválida/u);
  }
});
