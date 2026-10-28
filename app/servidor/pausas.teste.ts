// npx tsx --test app/servidor/pausas.teste.ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {pausasDaSaida} from "./pausas";

const config = {limiarDb: -35, minimaMs: 500, margemMs: 120};

test("silêncios viram pausas com a margem da fala", () => {
  const saida = [
    "  Duration: 00:00:10.00, start: 0.000000, bitrate: 128 kb/s",
    "[silencedetect @ 0x1] silence_start: 2.5",
    "[silencedetect @ 0x1] silence_end: 3.5 | silence_duration: 1",
    "[silencedetect @ 0x1] silence_start: 5",
    "[silencedetect @ 0x1] silence_end: 5.3 | silence_duration: 0.3",
    "[silencedetect @ 0x1] silence_start: 9.2",
  ].join("\n");
  // O de 0,3 s fica (curto demais); o último vai até o fim do vídeo.
  assert.deepEqual(pausasDaSaida(saida, config), [
    [2_620, 3_380],
    [9_320, 9_880],
  ]);
});

test("sem silêncio, sem pausa", () => {
  assert.deepEqual(pausasDaSaida("  Duration: 00:01:00.00, start: 0", config), []);
});
