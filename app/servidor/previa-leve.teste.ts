import assert from "node:assert/strict";
import {test} from "node:test";
import {pendentesDeRetomar} from "./previa-leve";

test("retomar depois do reinício: só os das últimas 24 h sem prévia nova, menores primeiro", () => {
  const agora = new Date("2026-10-29T17:00:00Z");
  const h = (horas: number) => new Date(agora.getTime() - horas * 3600_000);
  const originais = [
    {Key: "videos/u1/grande.mov", LastModified: h(1), Size: 500},
    {Key: "videos/u1/pronto.mp4", LastModified: h(2), Size: 10},
    {Key: "videos/u2/pequeno.mov", LastModified: h(1), Size: 5},
    {Key: "videos/u2/velho.mp4", LastModified: h(30), Size: 1},
    {Key: "videos/u2/reenviado.mp4", LastModified: h(1), Size: 50},
  ];
  const previas = new Map<string | undefined, Date | undefined>([
    ["previas/u1/pronto.mp4.mp4", h(1.5)],
    ["previas/u2/reenviado.mp4.mp4", h(3)],
  ]);
  assert.deepEqual(pendentesDeRetomar(originais, previas, agora), [
    {usuarioId: "u2", nome: "pequeno.mov"},
    {usuarioId: "u2", nome: "reenviado.mp4"},
    {usuarioId: "u1", nome: "grande.mov"},
  ]);
});
