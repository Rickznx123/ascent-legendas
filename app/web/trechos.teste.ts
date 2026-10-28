// npx tsx --test app/web/trechos.teste.ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {aparar, dividir, duracaoTotal, excluir, mover, msDoQuadro, noVideo, quadroDe} from "./trechos";

const duracoes = {"a.mp4": 10_000, "b.mp4": 4_000};
const base = [
  {id: "a", video: "a.mp4", inicioMs: 1_000},
  {id: "b", video: "b.mp4", inicioMs: 0, fimMs: 3_000},
];

test("tempo da timeline vira tempo do vídeo", () => {
  assert.equal(duracaoTotal(base, duracoes), 12_000);
  assert.deepEqual(noVideo(base, duracoes, 500), {indice: 0, comeco: 0, msNoVideo: 1_500});
  assert.deepEqual(noVideo(base, duracoes, 9_500), {indice: 1, comeco: 9_000, msNoVideo: 500});
  assert.equal(noVideo(base, duracoes, 12_000), undefined);
});

test("dividir corta no instante e não perto da borda", () => {
  assert.deepEqual(dividir(base, duracoes, 2_000, "n"), [
    {id: "a", video: "a.mp4", inicioMs: 1_000, fimMs: 3_000},
    {id: "n", video: "a.mp4", inicioMs: 3_000},
    base[1],
  ]);
  assert.equal(dividir(base, duracoes, 50), base);
});

test("aparar fica dentro do vídeo e volta a 'até o fim'", () => {
  assert.deepEqual(aparar(base, duracoes, "a", "inicio", -5)[0], {id: "a", video: "a.mp4", inicioMs: 0});
  assert.deepEqual(aparar(base, duracoes, "a", "fim", 2_000)[0], {id: "a", video: "a.mp4", inicioMs: 1_000, fimMs: 2_000});
  assert.deepEqual(aparar(base, duracoes, "b", "fim", 99_000)[1], {id: "b", video: "b.mp4", inicioMs: 0});
  assert.equal(aparar(base, duracoes, "b", "inicio", 9_000)[1].inicioMs, 2_900);
});

test("excluir e mover", () => {
  assert.deepEqual(excluir(base, "a"), [base[1]]);
  assert.deepEqual(mover(base, 0, 1).map((t) => t.id), ["b", "a"]);
});

test("quadro e ms fazem a mesma conta nos dois sentidos", () => {
  const muitos = Array.from({length: 40}, (_, i) => ({id: `t${i}`, video: "a.mp4", inicioMs: 0, fimMs: 1_010}));
  const quadro = quadroDe(muitos, duracoes, 30 * 1_010);
  assert.equal(quadro, 30 * 30);
  assert.equal(msDoQuadro(muitos, duracoes, quadro), 30 * 1_010);
});
