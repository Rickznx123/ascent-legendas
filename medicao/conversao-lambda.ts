// npx tsx medicao/conversao-lambda.ts <pasta-com-os-takes> <zip-da-funcao> [--memorias 2048,3008]
// Medição (plano dos takes): converte cada take para H.264 1080x1920 30 fps num Lambda
// com o ffmpeg do Remotion, lê a duração cobrada (REPORT do log) e calcula o custo.
// Cria a função remotion-render-medicao-ffmpeg-<memória> e apaga no fim.
import {readFileSync, readdirSync, statSync} from "node:fs";
import path from "node:path";
import {CreateFunctionCommand, DeleteFunctionCommand, GetFunctionCommand, InvokeCommand, LambdaClient, waitUntilFunctionActiveV2} from "@aws-sdk/client-lambda";
import {GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {getOrCreateBucket} from "@remotion/lambda";
import {REGIAO, exigir} from "../nuvem/env";

exigir("REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY");
const [pasta, zip] = process.argv.slice(2);
const indice = process.argv.indexOf("--memorias");
const memorias = (indice > 0 ? process.argv[indice + 1] : "2048,3008").split(",").map(Number);
const credentials = {accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!.trim(), secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!.trim()};
const s3 = new S3Client({region: REGIAO, credentials});
const lambda = new LambdaClient({region: REGIAO, credentials});
const {bucketName} = await getOrCreateBucket({region: REGIAO});
// Preço do Lambda x86 em us-east-2 (aws.amazon.com/lambda/pricing).
const POR_GB_S = 0.0000166667;
const POR_PEDIDO = 0.0000002;
// O ffmpeg do Remotion não tem os filtros pad e fps: 30 fps constantes pela saída (-r) e
// só scale (os takes medidos já são 9:16).
const ARGS = ["-vf", "scale=1080:1920,format=yuv420p", "-r", "30", "-fps_mode", "cfr",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-g", "30", "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart"];

const takes = readdirSync(pasta).sort();
for (const nome of takes) {
  const Key = `medicao/brutos/${nome}`;
  const tamanho = statSync(path.join(pasta, nome)).size;
  const existe = await s3.send(new HeadObjectCommand({Bucket: bucketName, Key})).then((r) => r.ContentLength === tamanho).catch(() => false);
  if (!existe) {
    await s3.send(new PutObjectCommand({Bucket: bucketName, Key, Body: readFileSync(path.join(pasta, nome))}));
  }
}

// O papel das funções do Remotion (o único que a chave pode passar).
const {getFunctions} = await import("@remotion/lambda");
const [remotion] = await getFunctions({region: REGIAO, compatibleOnly: false});
const papel = (await lambda.send(new GetFunctionCommand({FunctionName: remotion.functionName}))).Configuration!.Role!;

const resultados: unknown[] = [];
for (const memoria of memorias) {
  const FunctionName = `remotion-render-medicao-ffmpeg-${memoria}`;
  await lambda.send(
    new CreateFunctionCommand({
      FunctionName,
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Role: papel,
      Code: {ZipFile: readFileSync(zip)},
      MemorySize: memoria,
      Timeout: 900,
      EphemeralStorage: {Size: 2048},
      Architectures: ["x86_64"],
    }),
  );
  try {
    await waitUntilFunctionActiveV2({client: lambda, maxWaitTime: 120}, {FunctionName});
    const chamar = async (evento: object) => {
      const r = await lambda.send(new InvokeCommand({FunctionName, Payload: Buffer.from(JSON.stringify(evento)), LogType: "Tail"}));
      const log = Buffer.from(r.LogResult ?? "", "base64").toString("utf8");
      const cobradoMs = Number(log.match(/Billed Duration: (\d+) ms/)?.[1] ?? 0);
      const usadoMb = Number(log.match(/Max Memory Used: (\d+) MB/)?.[1] ?? 0);
      return {resposta: JSON.parse(Buffer.from(r.Payload ?? []).toString("utf8") || "null"), cobradoMs, usadoMb, erro: r.FunctionError};
    };
    if (memoria === memorias[0]) {
      console.log(JSON.stringify((await chamar({versao: true})).resposta, null, 1));
    }
    for (const nome of takes) {
      const entrada = await getSignedUrl(s3, new GetObjectCommand({Bucket: bucketName, Key: `medicao/brutos/${nome}`}), {expiresIn: 3600});
      const saida = await getSignedUrl(s3, new PutObjectCommand({Bucket: bucketName, Key: `medicao/convertidos/${memoria}-${nome.replace(/\.\w+$/, ".mp4")}`, ContentType: "video/mp4"}), {expiresIn: 3600});
      const inicio = Date.now();
      const r = await chamar({entrada, saida, args: ARGS});
      const custo = (r.cobradoMs / 1000) * (memoria / 1024) * POR_GB_S + POR_PEDIDO;
      const linha = {memoria, take: nome, totalS: (Date.now() - inicio) / 1000, ...r.resposta, cobradoS: r.cobradoMs / 1000, usadoMb: r.usadoMb, custoUsd: Number(custo.toFixed(5)), falhaDaFuncao: r.erro};
      console.log(JSON.stringify(linha));
      resultados.push(linha);
    }
  } finally {
    await lambda.send(new DeleteFunctionCommand({FunctionName}));
  }
}
console.log(JSON.stringify(resultados));
