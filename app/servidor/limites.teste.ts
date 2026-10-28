// Limite de pedidos: uso normal (muitas leituras e eventos) não recebe 429.
import assert from "node:assert/strict";
import {test} from "node:test";
import type {Request, Response} from "express";
import {limiteDePedidos} from "./limites";

const pedir = (limite: ReturnType<typeof limiteDePedidos>, method: string, path: string) => {
  let status = 200;
  let passou = false;
  const response = {status: (s: number) => ((status = s), response), json: () => response, end: () => response} as unknown as Response;
  limite({method, baseUrl: "", path} as Request, response, () => (passou = true));
  return {status, passou};
};

test("leituras e eventos de uma navegação normal passam", () => {
  const limite = limiteDePedidos(() => "conta");
  for (let i = 0; i < 100; i++) assert.equal(pedir(limite, "POST", "/api/eventos").passou, true);
  for (let i = 0; i < 200; i++) assert.equal(pedir(limite, "GET", "/api/video-info").passou, true);
});

test("eventos demais são descartados em silêncio, sem gastar o limite geral", () => {
  const limite = limiteDePedidos(() => "conta");
  for (let i = 0; i < 120; i++) pedir(limite, "POST", "/api/eventos");
  assert.deepEqual(pedir(limite, "POST", "/api/eventos"), {status: 204, passou: false});
  assert.equal(pedir(limite, "GET", "/api/estilo").passou, true);
});

test("rotas caras: 10 por minuto", () => {
  const limite = limiteDePedidos(() => "conta");
  for (let i = 0; i < 10; i++) assert.equal(pedir(limite, "POST", "/api/transcrever").passou, true);
  assert.equal(pedir(limite, "POST", "/api/transcrever").status, 429);
  assert.equal(pedir(limite, "GET", "/api/estilo").passou, true);
});
