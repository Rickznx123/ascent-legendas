import assert from "node:assert/strict";
import {test} from "node:test";
import {entrarComAviso, filaComVagas, textoDaFila} from "./limites";
import {ErroParaATela, MENSAGEM_DE_ERRO, MENSAGEM_DE_TAREFA_PARADA, mensagemParaATela, tarefasSoltas} from "./tarefas-soltas";

const esperarSinal = (sinal: AbortSignal) => new Promise<never>((_, rejeitar) => sinal.addEventListener("abort", () => rejeitar(sinal.reason)));

test("tarefa parada fora da fila é cancelada; na fila, não", async () => {
  const t = tarefasSoltas({paradaMaximaMs: 1000});
  let sinalDaParada: AbortSignal | undefined;
  const parada = t.iniciar("c:1", "a.mp4", async (progress, sinal) => {
    sinalDaParada = sinal;
    progress("Montando o vídeo — trecho 1 de 3", 0.1);
    return esperarSinal(sinal);
  }, () => undefined);
  const naFila = t.iniciar("c:2", "b.mp4", async (progress, sinal) => {
    progress(textoDaFila(1), 0);
    return esperarSinal(sinal);
  }, () => undefined);
  t.conferir(Date.now() + 500);
  assert.equal(parada.estado, "andamento");
  t.conferir(Date.now() + 5000);
  assert.equal(parada.estado, "falhou");
  assert.equal(parada.mensagem, MENSAGEM_DE_TAREFA_PARADA);
  assert.equal(sinalDaParada?.aborted, true);
  assert.equal(naFila.estado, "andamento");
});

test("estimativa: pela velocidade da tarefa rodando", () => {
  const t = tarefasSoltas();
  let andar: ((etapa: string, fracao?: number) => void) | undefined;
  t.iniciar("c:1", "a.mp4", async (progress) => {
    andar = progress;
    return new Promise(() => undefined);
  }, () => undefined);
  andar!("Montando o vídeo — trecho 1 de 2", 0);
  andar!("Montando o vídeo — trecho 2 de 2", 0.25);
  const e = t.estimativa(Date.now() + 60_000);
  assert.ok(e && Math.abs(e.inteiraMs - 240_000) < 2000 && Math.abs(e.proximaMs - 180_000) < 2000);
  assert.equal(textoDaFila(2, 180_000 + 240_000), "Na fila (posição 2): aguardando outro vídeo terminar · cerca de 7 min");
});

test("cancelada, a vaga volta para a fila na hora", async () => {
  const fila = filaComVagas(1);
  const cancelar = new AbortController();
  await entrarComAviso(fila, () => undefined, () => undefined, cancelar.signal);
  const avisos: string[] = [];
  const segunda = entrarComAviso(fila, (etapa) => avisos.push(etapa), () => undefined);
  assert.equal(avisos[0], "Na fila (posição 1): aguardando outro vídeo terminar");
  cancelar.abort();
  await segunda;
  assert.equal(fila.ocupadas(), 1);
  assert.equal(fila.esperando(), 0);
});

test("na tela, só o aviso escrito para ela; o erro técnico vira a mensagem genérica", () => {
  const doFfmpeg = Object.assign(new Error("Command failed: ffmpeg -ss 41.2 -i https://bucket.s3.amazonaws.com/x.MOV"), {cmd: "ffmpeg", code: 1});
  assert.equal(mensagemParaATela(doFfmpeg, "teste"), MENSAGEM_DE_ERRO);
  assert.equal(mensagemParaATela("texto solto", "teste"), MENSAGEM_DE_ERRO);
  assert.equal(mensagemParaATela(new ErroParaATela("Entre na sua conta."), "teste"), "Entre na sua conta.");
  assert.equal(mensagemParaATela(Object.assign(new Error("Assine para continuar."), {codigo: "assine"}), "teste"), "Assine para continuar.");
});
