// npx tsx nuvem/renderizar.ts --rotulo frio [--memoria 2048] [--quadros 200] [--pacote misto] [--paleta nome] [--baixar]
//   [--projeto projeto.json --video arquivo.mp4]
// Renderiza o vídeo do transcricao.json (ou de um projeto salvo à parte, como o
// de nuvem/transcrever.ts, com --projeto e --video) no Lambda e acrescenta o resultado
// (custo estimado pelo Remotion, tempos, configuração) em nuvem/resultados/renders.json.
// O vídeo vai uma vez para o bucket (entradas/) e a função lê por URL assinada.
// A função com a memória pedida precisa existir: npx tsx nuvem/implantar.ts --memoria N
import {createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {HeadObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {
  downloadMedia,
  getFunctions,
  getOrCreateBucket,
  getRenderProgress,
  getSites,
  presignUrl,
  renderMediaOnLambda,
} from "@remotion/lambda";
import {prepararSons} from "../src/motor/pasta-sons";
import {readProject} from "../src/motor/projeto";
import type {Projeto} from "../src/motor/projeto";
import {RAIZ, REGIAO, exigir} from "./env";
import {montarProps} from "./props";

exigir("REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY");

const valor = (opcao: string) => {
  const indice = process.argv.indexOf(opcao);
  return indice > 0 ? process.argv[indice + 1] : undefined;
};
const rotulo = valor("--rotulo") ?? "render";
const memoria = Number(valor("--memoria") ?? 2048);
const quadrosPorLambda = Number(valor("--quadros") ?? 200);
const pacote = valor("--pacote") ?? "misto";
const paleta = valor("--paleta");
// Projeto salvo à parte (o transcricao.json não muda) e o vídeo dele.
const arquivoDoProjeto = valor("--projeto");
const projeto = arquivoDoProjeto ? (JSON.parse(readFileSync(path.resolve(arquivoDoProjeto), "utf8")) as Projeto) : undefined;

const RESULTADOS = path.join(RAIZ, "nuvem", "resultados");
mkdirSync(RESULTADOS, {recursive: true});

// Com a memória pedida, a de maior tempo limite.
const funcao = (await getFunctions({region: REGIAO, compatibleOnly: true}))
  .filter((f) => f.memorySizeInMb === memoria)
  .sort((a, b) => b.timeoutInSeconds - a.timeoutInSeconds)[0];
if (!funcao) {
  throw new Error(`Não há função com ${memoria} MB. Rode: npx tsx nuvem/implantar.ts --memoria ${memoria}`);
}
const site = (await getSites({region: REGIAO})).sites.find((s) => s.id === "legendas");
if (!site) {
  throw new Error("O site 'legendas' não existe. Rode: npx tsx nuvem/implantar.ts");
}
const {bucketName} = await getOrCreateBucket({region: REGIAO});

// Sobe o vídeo uma vez (mesmo nome e tamanho: reaproveita).
const inputPath = valor("--video") ? path.resolve(valor("--video")!) : path.join(RAIZ, (projeto ?? readProject(RAIZ))?.source ?? "");
const chave = "entradas/video-teste.mp4";
const s3 = new S3Client({
  region: REGIAO,
  credentials: {
    accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!.trim(),
  },
});
const tamanho = statSync(inputPath).size;
const noBucket = await s3
  .send(new HeadObjectCommand({Bucket: bucketName, Key: chave}))
  .then((r) => r.ContentLength === tamanho)
  .catch(() => false);
if (!noBucket) {
  const inicioUpload = Date.now();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: chave,
      Body: createReadStream(inputPath),
      ContentLength: tamanho,
      ContentType: "video/mp4",
    }),
  );
  console.log(`Vídeo enviado ao bucket em ${((Date.now() - inicioUpload) / 1000).toFixed(1)} s`);
}
const videoSrc = await presignUrl({
  region: REGIAO,
  bucketName,
  objectKey: chave,
  expiresInSeconds: 3600,
  checkIfObjectExists: true,
});

const props = await montarProps(inputPath, {pacote, paleta}, projeto);

// Sons tocados (veja somTocado em src/sons.ts): gerados aqui e enviados para a
// pasta pública do site, ao lado dos sons de sons/. Um novo implantar.ts os apaga;
// eles voltam no próximo render.
const temp = mkdtempSync(path.join(os.tmpdir(), "legendas-sons-"));
try {
  const tocados = await prepararSons(RAIZ, props.efeitos ?? [], props.video.fps, temp);
  for (const arquivo of tocados) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: `sites/${site.id}/public/sons/${arquivo}`,
        Body: readFileSync(path.join(temp, arquivo)),
        ContentType: "audio/wav",
        ACL: "public-read",
      }),
    );
  }
  console.log(`${tocados.length} sons tocados enviados`);
} finally {
  rmSync(temp, {recursive: true, force: true});
}

const inicio = Date.now();
// --retomar <renderId>: só acompanha um render já iniciado (o tempo total fica
// sendo o medido pelo Remotion).
const retomado = valor("--retomar");
const renderId =
  retomado ??
  (
    await renderMediaOnLambda({
      region: REGIAO,
      functionName: funcao.functionName,
      serveUrl: site.serveUrl,
      composition: "CaptionedVideo",
      inputProps: {...props, videoSrc},
      codec: "h264",
      audioCodec: "aac",
      framesPerLambda: quadrosPorLambda,
      privacy: "private",
      outName: `renders/${rotulo}.mp4`,
      overwrite: true,
    })
  ).renderId;
console.log(`Render ${renderId} ${retomado ? "retomado" : "iniciado"} (${funcao.functionName}, ${quadrosPorLambda} quadros por Lambda)`);

// Cada consulta de progresso invoca a função e ocupa uma vaga de execução
// simultânea: com o limite baixo da conta, a AWS às vezes responde 429.
const progresso = async () => {
  for (;;) {
    try {
      return await getRenderProgress({renderId, bucketName, functionName: funcao.functionName, region: REGIAO});
    } catch (erro) {
      if ((erro as Error).name !== "TooManyRequestsException") {
        throw erro;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};

for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const p = await progresso();
  if (p.fatalErrorEncountered) {
    throw new Error(p.errors.map((e) => e.message).join("\n"));
  }
  if (!p.done) {
    process.stdout.write(`\r${Math.round(p.overallProgress * 100)}%  `);
    continue;
  }
  const registro = {
    rotulo,
    quando: new Date().toISOString(),
    memoriaMb: memoria,
    quadrosPorLambda,
    pedacos: p.chunks,
    lambdas: p.lambdasInvoked,
    quadros: props.video.durationInFrames,
    duracaoVideoS: props.video.durationInFrames / props.video.fps,
    custoUsd: p.costs.accruedSoFar,
    custoTexto: p.costs.displayCost,
    tempoTotalS: retomado ? null : (Date.now() - inicio) / 1000,
    tempoRemotionS: (p.timeToFinish ?? 0) / 1000,
    tempoQuadrosS: (p.timeToRenderFrames ?? 0) / 1000,
    tempoCombinarS: (p.timeToCombine ?? 0) / 1000,
    faturadoS: (p.estimatedBillingDurationInMilliseconds ?? 0) / 1000,
    tentativasExtras: p.retriesInfo.length,
    tamanhoSaidaMb: (p.outputSizeInBytes ?? 0) / 1e6,
    renderId,
  };
  console.log(`\n${JSON.stringify(registro, null, 2)}`);
  const arquivo = path.join(RESULTADOS, "renders.json");
  const anteriores = existsSync(arquivo) ? (JSON.parse(readFileSync(arquivo, "utf8")) as unknown[]) : [];
  writeFileSync(arquivo, JSON.stringify([...anteriores, registro], null, 2));

  if (process.argv.includes("--baixar")) {
    const destino = path.join(RESULTADOS, `nuvem-${rotulo}.mp4`);
    await downloadMedia({bucketName, region: REGIAO, renderId, outPath: destino});
    console.log(`Baixado em ${destino}`);
  }
  break;
}
