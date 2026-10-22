// npx tsx medicao/render-montagem.ts <pasta-com-os-takes-convertidos> <transcricao-juntada.json> [--vezes 2]
// Medição (plano dos takes): render no Lambda (a função de 2048 MB da exportação,
// 60 quadros por Lambda) de 40 s montados com 10 cortes de 5 takes, comparado com 40 s
// de um take só. Sem legendas nos dois (a diferença é o que interessa).
import {mkdtempSync, readFileSync, readdirSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {deploySite, getFunctions, getOrCreateBucket, getRenderProgress, presignUrl, renderMediaOnLambda} from "@remotion/lambda";
import {execFileAsync, ffmpegPath} from "../src/motor/ferramentas";
import {REGIAO, exigir} from "../nuvem/env";

exigir("REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY");
const [pasta, arquivoDosTrechos] = process.argv.slice(2);
const vezes = Number(process.argv[process.argv.indexOf("--vezes") + 1] || 1);
const {trechos} = JSON.parse(readFileSync(arquivoDosTrechos, "utf8")) as {trechos: {take: string; deS: number; ateS: number}[]};
const s3 = new S3Client({region: REGIAO, credentials: {accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!.trim(), secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!.trim()}});
const {bucketName} = await getOrCreateBucket({region: REGIAO});
const funcao = (await getFunctions({region: REGIAO, compatibleOnly: true})).find((f) => f.memorySizeInMb === 2048)!;
const FADE_S = 0.015;

const subir = async (arquivo: string, Key: string) => {
  await s3.send(new PutObjectCommand({Bucket: bucketName, Key, Body: readFileSync(arquivo)}));
  return (await presignUrl({region: REGIAO, bucketName, objectKey: Key, expiresInSeconds: 7200, checkIfObjectExists: true}))!;
};

const urls: Record<string, string> = {};
for (const take of readdirSync(pasta).filter((nome) => nome.endsWith(".mp4"))) {
  urls[take] = await subir(path.join(pasta, take), `medicao/takes/${take}`);
}

// Áudio juntado para o render (AAC 48 kHz estéreo), com os mesmos fades da transcrição.
const temp = mkdtempSync(path.join(os.tmpdir(), "legendas-montagem-"));
const audio = path.join(temp, "juntado.m4a");
const inicioDoAudio = Date.now();
await execFileAsync(ffmpegPath(), [
  "-v", "error", "-y",
  ...trechos.flatMap(({take}) => ["-i", path.join(pasta, take)]),
  "-filter_complex",
  `${trechos.map(({deS, ateS}, i) => `[${i}:a]atrim=${deS}:${ateS},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE_S},afade=t=out:st=${(ateS - deS - FADE_S).toFixed(3)}:d=${FADE_S}[a${i}]`).join(";")};${trechos.map((_, i) => `[a${i}]`).join("")}concat=n=${trechos.length}:v=0:a=1[a]`,
  "-map", "[a]", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", audio,
]);
console.log(`Áudio juntado em ${((Date.now() - inicioDoAudio) / 1000).toFixed(1)} s`);
const audioUrl = await subir(audio, "medicao/takes/juntado.m4a");
rmSync(temp, {recursive: true, force: true});

const inicioDoSite = Date.now();
const {serveUrl} = await deploySite({region: REGIAO, bucketName, entryPoint: path.join(import.meta.dirname, "montagem", "index.tsx"), siteName: "medicao-montagem"});
console.log(`Site medicao-montagem publicado em ${((Date.now() - inicioDoSite) / 1000).toFixed(1)} s`);

const casos = {
  "um-take-40s": {trechos: [{src: urls[trechos[0].take], deQuadro: 0, quadros: 1200}]},
  "montagem-10-cortes-5-takes": {
    trechos: trechos.map(({take, deS, ateS}) => ({src: urls[take], deQuadro: Math.round(deS * 30), quadros: Math.round((ateS - deS) * 30)})),
    audio: audioUrl,
  },
};

for (let vez = 1; vez <= vezes; vez++) {
  for (const [rotulo, inputProps] of Object.entries(casos)) {
    const inicio = Date.now();
    const {renderId} = await renderMediaOnLambda({
      region: REGIAO, functionName: funcao.functionName, serveUrl, composition: "Montagem", inputProps,
      codec: "h264", audioCodec: "aac", framesPerLambda: 60, privacy: "private", outName: `medicao/${rotulo}.mp4`, overwrite: true,
    });
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const p = await getRenderProgress({renderId, bucketName, functionName: funcao.functionName, region: REGIAO}).catch(() => undefined);
      if (!p) continue;
      if (p.fatalErrorEncountered) throw new Error(p.errors.map((e) => e.message).join("\n"));
      if (p.done) {
        console.log(JSON.stringify({vez, rotulo, totalS: (Date.now() - inicio) / 1000, lambdas: p.lambdasInvoked, custoUsd: p.costs.accruedSoFar, saida: p.outKey}));
        break;
      }
    }
  }
}
