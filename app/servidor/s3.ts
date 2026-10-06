// Bucket S3 dos vídeos (Etapa 3), com as credenciais do usuário IAM do Remotion
// (permissão: nuvem/politicas/bucket-videos.json). Sem as credenciais no ambiente,
// não há S3 e o envio continua pelo servidor, para o disco.
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import type {Configuracao} from "./configuracao";

export type ArmazenamentoS3 = {
  s3: S3Client;
  bucket: string;
  // Endereço assinado de leitura (o ffprobe e o ffmpeg leem o vídeo por ele).
  enderecoDeLeitura: (chave: string, segundos?: number) => Promise<string>;
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
  };
};
