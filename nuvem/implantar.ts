// npx tsx nuvem/implantar.ts [--memoria 2048] [--timeout 900] [--so-funcao]
// Cria (ou reaproveita) na região do .env: o bucket remotionlambda-*, a função
// remotion-render-* e o site com o bundle de src/index.tsx. Pode rodar de novo
// sem duplicar nada; o site é sobrescrito com o código atual.
// O site leva a pasta sons/ como pasta pública (staticFile("sons/...")), como no
// render local. Templates e paletas não entram como arquivos: viajam nas props,
// como no render local. As fontes vêm do Google Fonts no momento do render.
import {cpSync, mkdtempSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {deployFunction, deploySite, getOrCreateBucket} from "@remotion/lambda";
import {RAIZ, REGIAO, exigir} from "./env";

exigir("REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY");

const valor = (opcao: string) => {
  const indice = process.argv.indexOf(opcao);
  return indice > 0 ? process.argv[indice + 1] : undefined;
};
const memorySizeInMb = Number(valor("--memoria") ?? 2048);
// Cada Lambda renderiza uns 2 quadros/s deste vídeo (HEVC 1080x1920): com o
// limite baixo de execuções simultâneas da conta, os pedaços ficam grandes e
// 240 s não bastam. 900 s é o máximo do Lambda.
const timeoutInSeconds = Number(valor("--timeout") ?? 900);

const {bucketName} = await getOrCreateBucket({region: REGIAO});
console.log(`Bucket: ${bucketName}`);

const {functionName, alreadyExisted} = await deployFunction({
  region: REGIAO,
  timeoutInSeconds,
  memorySizeInMb,
  diskSizeInMb: 2048,
  createCloudWatchLogGroup: true,
});
console.log(`Função: ${functionName}${alreadyExisted ? " (já existia)" : ""}`);

if (process.argv.includes("--so-funcao")) {
  process.exit(0);
}

const publica = mkdtempSync(path.join(os.tmpdir(), "legendas-site-"));
try {
  cpSync(path.join(RAIZ, "sons"), path.join(publica, "sons"), {recursive: true});
  const {serveUrl} = await deploySite({
    region: REGIAO,
    bucketName,
    entryPoint: path.join(RAIZ, "src", "index.tsx"),
    siteName: "legendas",
    options: {publicDir: publica},
  });
  console.log(`Site: ${serveUrl}`);
} finally {
  rmSync(publica, {recursive: true, force: true});
}
