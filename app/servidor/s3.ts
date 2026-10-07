// Bucket S3 dos vídeos (Etapa 3), com as credenciais do usuário IAM do Remotion
// (permissão: nuvem/politicas/bucket-videos.json). Sem as credenciais no ambiente,
// não há S3 e o envio continua pelo servidor, para o disco.
import {GetObjectCommand, HeadObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import type {Configuracao} from "./configuracao";

export type ArmazenamentoS3 = {
  s3: S3Client;
  bucket: string;
  // Endereço assinado de leitura (o ffprobe e o ffmpeg leem o vídeo por ele).
  enderecoDeLeitura: (chave: string, segundos?: number) => Promise<string>;
  // O arquivo está no bucket? (Vídeos enviados antes do S3 só existem no disco.)
  existe: (chave: string) => Promise<boolean>;
  // Quando o arquivo chegou e o título guardado no envio (sem o arquivo: undefined).
  sobre: (chave: string) => Promise<{enviadoEm: Date; titulo?: string} | undefined>;
};

export const s3DoAmbiente = (configuracao: Configuracao): ArmazenamentoS3 | undefined => {
  const accessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }
  const s3 = new S3Client({region: configuracao.regiaoAws, credentials: {accessKeyId, secretAccessKey}});
  const bucket = configuracao.bucketDosVideos;
  return {
    s3,
    bucket,
    enderecoDeLeitura: (chave, segundos = 3600) => getSignedUrl(s3, new GetObjectCommand({Bucket: bucket, Key: chave}), {expiresIn: segundos}),
    sobre: (chave) =>
      s3.send(new HeadObjectCommand({Bucket: bucket, Key: chave})).then(
        ({LastModified, Metadata}) => ({
          enviadoEm: LastModified ?? new Date(),
          titulo: Metadata?.titulo ? decodeURIComponent(Metadata.titulo) : undefined,
        }),
        (erro: {name?: string; $metadata?: {httpStatusCode?: number}}) => {
          if (erro.name === "NotFound" || erro.$metadata?.httpStatusCode === 404) return undefined;
          throw erro;
        },
      ),
    existe: (chave) =>
      s3.send(new HeadObjectCommand({Bucket: bucket, Key: chave})).then(
        () => true,
        (erro: {name?: string; $metadata?: {httpStatusCode?: number}}) => {
          if (erro.name === "NotFound" || erro.$metadata?.httpStatusCode === 404) return false;
          throw erro;
        },
      ),
  };
};
