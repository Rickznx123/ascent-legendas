import assert from "node:assert/strict";
import {test} from "node:test";
import {conferirSair, emailDaVez, linkDeSair, montarEmail} from "./recuperacao";

const HORA = 3600_000;
const agora = new Date("2026-10-27T12:00:00Z");
const perfil = (horasAtras: number, feitos: {um?: boolean; vinte?: boolean} = {}) => ({
  criado_em: new Date(agora.getTime() - horasAtras * HORA).toISOString(),
  recuperacao_1h_em: feitos.um ? agora.toISOString() : null,
  recuperacao_24h_em: feitos.vinte ? agora.toISOString() : null,
});

test("e-mail da vez pela idade da conta", () => {
  assert.equal(emailDaVez(perfil(0.5), agora), undefined);
  assert.equal(emailDaVez(perfil(1.1), agora), "recuperacao_1h");
  assert.equal(emailDaVez(perfil(5, {um: true}), agora), undefined);
  assert.equal(emailDaVez(perfil(25, {um: true}), agora), "recuperacao_24h");
  // O de 1 h perdido (servidor fora do ar): só o de 24 h.
  assert.equal(emailDaVez(perfil(30), agora), "recuperacao_24h");
  assert.equal(emailDaVez(perfil(30, {vinte: true}), agora), undefined);
  assert.equal(emailDaVez(perfil(80), agora), undefined);
});

test("link de sair: só a assinatura certa da mesma conta", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const outro = "66666666-2222-3333-4444-555555555555";
  const token = new URL(linkDeSair("segredo", id)).searchParams.get("t");
  assert.equal(conferirSair("segredo", id, token), true);
  assert.equal(conferirSair("segredo", outro, token), false);
  assert.equal(conferirSair("outra-chave", id, token), false);
  assert.equal(conferirSair("segredo", id, "x"), false);
  assert.equal(conferirSair("segredo", "não-é-id", token), false);
});

test("e-mails com o link de sair e o texto de cada etapa", () => {
  const sair = "https://exemplo/sair";
  const um = montarEmail({tipo: "recuperacao_1h", nome: "Ana Souza", transcreveu: true, sair});
  assert.match(um.html, /Oi, Ana!/u);
  assert.match(um.html, /falta só exportar/u);
  assert.match(um.texto, /Sair da lista: https:\/\/exemplo\/sair/u);
  assert.doesNotMatch(um.html, /antes\.jpg|estilos\/a\.jpg/u);
  const vinte = montarEmail({tipo: "recuperacao_24h", transcreveu: false, sair, antesDepois: true});
  assert.match(vinte.html, /antes\.jpg/u);
  assert.match(vinte.html, /Oi!/u);
  assert.match(montarEmail({tipo: "recuperacao_24h", transcreveu: false, sair}).html, /estilos\/a\.jpg/u);
  assert.equal(montarEmail({tipo: "aviso_render", transcreveu: true, sair}).assunto, "Corrigimos o erro da sua exportação");
});
