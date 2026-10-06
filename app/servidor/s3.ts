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
  // Diagnóstico (provisório, envio parando no iPhone): cada comando enviado ao S3 e a
  // resposta, no terminal (nome do comando, status e tempo; nunca chaves nem
  // endereços). Os endereços assinados também passam por aqui, sem resposta do S3:
  // esses não são registrados.
  s3.middlewareStack.add(
    (next, contexto) => async (args) => {
      const inicio = Date.now();
      const horario = () => new Date().toLocaleTimeString("pt-BR", {hour12: false});
      try {
        const resultado = await next(args);
        const status = (resultado.output as {$metadata?: {httpStatusCode?: number}}).$metadata?.httpStatusCode;
        if (status !== undefined) {
          console.log(`[envio ${horario()}] s3 ${contexto.commandName} → ${status} (${Date.now() - inicio} ms)`);
        }
        return resultado;
      } catch (erro) {
        const {name, message, $metadata} = erro as {name?: string; message?: string; $metadata?: {httpStatusCode?: number}};
        console.log(`[envio ${horario()}] s3 ${contexto.commandName} → ${$metadata?.httpStatusCode ?? "sem resposta"} ${name}: ${message} (${Date.now() - inicio} ms)`);
        throw erro;
      }
    },
    {step: "initialize", name: "registroDoDiagnostico"},
  );
  return {
    s3,
    bucket,
    enderecoDeLeitura: (chave, segundos = 3600) => getSignedUrl(s3, new GetObjectCommand({Bucket: bucket, Key: chave}), {expiresIn: segundos}),
  };
};
