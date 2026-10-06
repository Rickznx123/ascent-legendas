// npx tsx nuvem/criar-bucket.ts
// Cria (ou atualiza) o bucket S3 dos vídeos dos usuários, em us-east-2. Pode rodar
// de novo sem estragar nada: rode de novo quando o endereço do app mudar
// (ENDERECO_DO_APP), para o S3 liberar o navegador desse endereço.
// - Privado: nada público, dono único dos arquivos, criptografado.
// - CORS: o navegador do app pode enviar (em partes) e ler os vídeos por endereço
//   assinado; só do endereço do app, do computador e dos túneis trycloudflare.
// - Expiração (PASTAS_NO_BUCKET): enviados e prévias em 30 dias, exportados em 7,
//   envios abandonados em 2.
// Permissão do usuário IAM: nuvem/politicas/bucket-videos.json.
import {
  CreateBucketCommand,
  GetBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketOwnershipControlsCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {BucketLocationConstraint} from "@aws-sdk/client-s3";
import {DIAS_PARA_ENVIO_ABANDONADO, PASTAS_NO_BUCKET, configuracaoDoAmbiente} from "../app/servidor/configuracao";
import {exigir} from "./env";

exigir("REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY");
const {bucketDosVideos: Bucket, regiaoAws, enderecoDoApp} = configuracaoDoAmbiente();
const s3 = new S3Client({
  region: regiaoAws,
  credentials: {
    accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID!.trim(),
    secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY!.trim(),
  },
});

// Endereços cujo navegador pode usar o bucket.
const origens = [...new Set([enderecoDoApp, "http://localhost:5174", "http://127.0.0.1:5174", "https://*.trycloudflare.com"])];

const existe = await s3
  .send(new HeadBucketCommand({Bucket}))
  .then(() => true)
  .catch((erro: {$metadata?: {httpStatusCode?: number}}) => {
    if (erro.$metadata?.httpStatusCode === 404) return false;
    throw erro;
  });
if (!existe) {
  await s3.send(
    new CreateBucketCommand({
      Bucket,
      CreateBucketConfiguration: {LocationConstraint: regiaoAws as BucketLocationConstraint},
      ObjectOwnership: "BucketOwnerEnforced",
    }),
  );
}
console.log(`Bucket ${Bucket} (${regiaoAws}): ${existe ? "já existia" : "criado"}`);

await s3.send(
  new PutPublicAccessBlockCommand({
    Bucket,
    PublicAccessBlockConfiguration: {BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true},
  }),
);
await s3.send(new PutBucketOwnershipControlsCommand({Bucket, OwnershipControls: {Rules: [{ObjectOwnership: "BucketOwnerEnforced"}]}}));
await s3.send(
  new PutBucketEncryptionCommand({
    Bucket,
    ServerSideEncryptionConfiguration: {Rules: [{ApplyServerSideEncryptionByDefault: {SSEAlgorithm: "AES256"}, BucketKeyEnabled: true}]},
  }),
);
console.log("Privado: acesso público bloqueado, dono único dos arquivos, criptografia AES-256");

await s3.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origens,
          AllowedMethods: ["GET", "HEAD", "PUT"],
          AllowedHeaders: ["*"],
          // ETag: o envio em partes precisa dela para fechar o envio; os outros, para
          // a prévia pular para qualquer ponto do vídeo.
          ExposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
console.log(`CORS: ${origens.join(", ")}`);

await s3.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket,
    LifecycleConfiguration: {
      Rules: [
        ...Object.entries(PASTAS_NO_BUCKET).map(([nome, {prefixo, dias}]) => ({
          ID: `apagar-${nome}-em-${dias}-dias`,
          Status: "Enabled" as const,
          Filter: {Prefix: prefixo},
          Expiration: {Days: dias},
        })),
        {
          ID: `envios-abandonados-em-${DIAS_PARA_ENVIO_ABANDONADO}-dias`,
          Status: "Enabled" as const,
          Filter: {Prefix: ""},
          AbortIncompleteMultipartUpload: {DaysAfterInitiation: DIAS_PARA_ENVIO_ABANDONADO},
        },
      ],
    },
  }),
);

// Confere o que ficou gravado.
const cors = await s3.send(new GetBucketCorsCommand({Bucket}));
const regras = await s3.send(new GetBucketLifecycleConfigurationCommand({Bucket}));
console.log(`Conferido: ${cors.CORSRules?.length ?? 0} regra de CORS; expiração: ${(regras.Rules ?? []).map((r) => r.ID).join(", ")}`);
