// npx tsx --test app/web/tentativas.teste.ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {comTentativas} from "./tentativas";

const semEsperar = async () => undefined;

test("falha passageira: tenta mais 2 vezes e consegue", async () => {
  let vezes = 0;
  const resultado = await comTentativas(async () => {
    vezes++;
    if (vezes < 3) throw new TypeError("Sem conexão");
    return "ok";
  }, 2, semEsperar);
  assert.equal(resultado, "ok");
  assert.equal(vezes, 3);
});

test("depois de 3 vezes, desiste com o último erro", async () => {
  let vezes = 0;
  await assert.rejects(
    comTentativas(async () => {
      vezes++;
      throw Object.assign(new Error("servidor caiu"), {status: 502});
    }, 2, semEsperar),
    /servidor caiu/u,
  );
  assert.equal(vezes, 3);
});

test("recusa do servidor (4xx) não se repete", async () => {
  let vezes = 0;
  await assert.rejects(
    comTentativas(async () => {
      vezes++;
      throw Object.assign(new Error("Não deu para ler este arquivo como vídeo."), {status: 400});
    }, 2, semEsperar),
  );
  assert.equal(vezes, 1);
});
