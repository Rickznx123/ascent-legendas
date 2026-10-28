// npx tsx --test app/servidor/montagem.teste.ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {argumentosDoTrecho, nomeDoMontado, tamanhoDoMontado} from "./montagem";

test("cada montagem ganha um nome novo", () => {
  assert.equal(nomeDoMontado("0123456789ab-cdef"), "projeto-01234567-v1.mp4");
  assert.equal(nomeDoMontado("0123456789ab-cdef", "projeto-01234567-v7.mp4"), "projeto-01234567-v8.mp4");
});

test("tamanho: lado menor até 1080, sempre par", () => {
  assert.deepEqual(tamanhoDoMontado(2160, 3840), {largura: 1080, altura: 1920});
  assert.deepEqual(tamanhoDoMontado(720, 1281), {largura: 720, altura: 1282});
});

test("trecho: corta só a parte usada, com o número exato de quadros", () => {
  const args = argumentosDoTrecho({entrada: "a.mp4", duracaoMs: 9_000, largura: 1080, altura: 1920, temAudio: false}, {id: "a", video: "a.mp4", inicioMs: 1_500}, 45, {largura: 1080, altura: 1920}, "p.mkv");
  assert.deepEqual(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 4), ["-ss", "1.5", "-t", "2.5"]);
  assert.equal(args[args.indexOf("-frames:v") + 1], "45");
  // Sem áudio no vídeo: silêncio no lugar.
  assert.ok(args.includes("anullsrc=r=48000:cl=stereo"));
  assert.match(args[args.indexOf("-filter_complex") + 1], /\[1:a\].*atrim=0:1\.5,afade=t=in:d=0\.015,afade=t=out:st=1\.485/u);
});
