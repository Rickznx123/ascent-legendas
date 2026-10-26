// npx tsx --test app/servidor/renders.teste.ts
import assert from "node:assert/strict";
import {test} from "node:test";
import {LAMBDA} from "./renders";

const video = (width: number, height: number) => ({width, height, fps: 30, durationInFrames: 3000});

test("pedaços: 60 quadros até 90 s; acima, 200 só se o vídeo cabe na saída", () => {
  assert.equal(LAMBDA.quadrosPorLambda(60, video(2160, 3840)), 60);
  assert.equal(LAMBDA.quadrosPorLambda(125, video(1080, 1920)), 200);
  assert.equal(LAMBDA.quadrosPorLambda(125, video(1920, 1080)), 200);
  assert.equal(LAMBDA.quadrosPorLambda(125, video(2160, 3840)), 60);
  assert.equal(LAMBDA.quadrosPorLambda(153, video(1440, 2560)), 60);
  assert.equal(LAMBDA.quadrosPorLambda(125), 200);
});
