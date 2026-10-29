import assert from "node:assert/strict";
import {test} from "node:test";
import {mostrarBanner} from "./grupo";

const agora = new Date("2026-10-29T12:00:00Z");
const diasAtras = (dias: number) => new Date(agora.getTime() - dias * 864e5).toISOString();

test("banner: some ao entrar, volta 3 dias depois de fechar, até 3 fechamentos", () => {
  assert.equal(mostrarBanner({grupo_entrou_em: null, grupo_fechou_em: null, grupo_fechamentos: 0}, agora), true);
  assert.equal(mostrarBanner({grupo_entrou_em: diasAtras(10), grupo_fechou_em: null, grupo_fechamentos: 0}, agora), false);
  assert.equal(mostrarBanner({grupo_entrou_em: null, grupo_fechou_em: diasAtras(2.9), grupo_fechamentos: 1}, agora), false);
  assert.equal(mostrarBanner({grupo_entrou_em: null, grupo_fechou_em: diasAtras(3), grupo_fechamentos: 2}, agora), true);
  assert.equal(mostrarBanner({grupo_entrou_em: null, grupo_fechou_em: diasAtras(30), grupo_fechamentos: 3}, agora), false);
});
