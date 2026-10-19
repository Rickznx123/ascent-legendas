// npm run teste:tempos — "Tempo após a fala" e início/fim manuais (src/tempos.ts).
import assert from "node:assert/strict";
import {test} from "node:test";
import {computeTimeline} from "./tempos";
import type {AssignedCaptionBlock} from "./types";

const palavra = (text: string, startMs: number, endMs: number) => ({text, startMs, endMs});
const bloco = (words: ReturnType<typeof palavra>[], extra: Partial<AssignedCaptionBlock> = {}): AssignedCaptionBlock => ({
  words,
  startMs: words[0].startMs,
  endMs: words[words.length - 1].endMs,
  keyword: words[0].text,
  template: "linear",
  family: "linear",
  ...extra,
});
// Três blocos com silêncio longo entre eles.
const blocos = (primeiro: Partial<AssignedCaptionBlock> = {}, segundo: Partial<AssignedCaptionBlock> = {}) => [
  bloco([palavra("a", 0, 500), palavra("b", 500, 1000)], primeiro),
  bloco([palavra("c", 4000, 4500)], segundo),
  bloco([palavra("d", 8000, 8600)]),
];

test("tempo após a fala: automático e ajustado", () => {
  assert.equal(computeTimeline(blocos())[0].hideMs, 2200);
  assert.equal(computeTimeline(blocos(), [], 30, 300)[0].hideMs, 1300);
});

test("fim manual: vale sobre o ajuste geral, dentro dos limites", () => {
  const fim = (fimMs: number) => computeTimeline(blocos({fimMs}), [], 30, 300)[0].hideMs;
  assert.equal(fim(700), 700);
  assert.equal(fim(3000), 3000);
  assert.equal(fim(100), 300); // início do bloco + 0,3 s
  assert.equal(fim(9999), 4000); // início do seguinte
});

test("início manual: o anterior sai quando ele entra", () => {
  const timeline = computeTimeline(blocos({}, {inicioMs: 1100}));
  assert.equal(timeline[1].showMs, 1100);
  assert.equal(timeline[0].hideMs, 1100);
  assert.equal(computeTimeline(blocos({}, {inicioMs: 50}))[1].showMs, 300);
});

test("Sincronia precisa: mesmas regras", () => {
  const precisa = (extra: Partial<AssignedCaptionBlock>) =>
    blocos(extra).map((b) => ({...b, words: b.words.map((w) => ({...w, faladaMs: w.startMs}))}));
  assert.equal(computeTimeline(precisa({}), [], 30, 300)[0].hideMs, 1300);
  assert.equal(computeTimeline(precisa({fimMs: 800}), [], 30, 300)[0].hideMs, 800);
});
