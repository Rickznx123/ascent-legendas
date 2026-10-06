// Os vídeos de cada conta (Etapa 3, bloco 6): os enviados ficam só no S3
// (videos/<conta>/<nome>); os antigos, enviados antes do S3, só no disco
// (usuarios/<conta>/). A lista junta os dois; o ffmpeg e o ffprobe leem o do S3
// pelo endereço assinado. Sem S3 (ou sem login), só o disco, como sempre.
import {existsSync} from "node:fs";
import {mkdir, rename} from "node:fs/promises";
import path from "node:path";
import {DeleteObjectsCommand, ListObjectsV2Command} from "@aws-sdk/client-s3";
import {PASTAS_NO_BUCKET} from "./configuracao";
import type {Espaco} from "./espaco";
import type {ArmazenamentoS3} from "./s3";

const EXTENSAO_DE_VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/iu;
// Vídeos tirados da lista por "Remover vídeo" no disco (o arquivo não é apagado).
const PASTA_DE_REMOVIDOS = "removidos";

export type FonteDoVideo = {onde: "s3"; chave: string} | {onde: "disco"; caminho: string};

export const videosDasContas = (armazenamento: ArmazenamentoS3 | undefined) => {
  const prefixoDe = (espaco: Espaco) => (espaco.usuario ? `${PASTAS_NO_BUCKET.videos.prefixo}${espaco.usuario.id}/` : undefined);
  const comS3 = (espaco: Espaco) => Boolean(armazenamento && espaco.usuario);

  const noS3 = async (espaco: Espaco): Promise<string[]> => {
    const prefixo = prefixoDe(espaco);
    if (!armazenamento || !prefixo) return [];
    const nomes: string[] = [];
    let continuar: string | undefined;
    do {
      const lista = await armazenamento.s3.send(
        new ListObjectsV2Command({Bucket: armazenamento.bucket, Prefix: prefixo, ContinuationToken: continuar}),
      );
      for (const objeto of lista.Contents ?? []) {
        const nome = (objeto.Key ?? "").slice(prefixo.length);
        if (nome && !nome.includes("/") && EXTENSAO_DE_VIDEO.test(nome)) nomes.push(nome);
      }
      continuar = lista.IsTruncated ? lista.NextContinuationToken : undefined;
    } while (continuar);
    return nomes;
  };

  // Lista da conta: os do S3 e os antigos do disco, sem repetir, em ordem.
  const listar = async (espaco: Espaco): Promise<string[]> =>
    [...new Set([...(await noS3(espaco)), ...espaco.videos()])].sort((a, b) => a.localeCompare(b));

  // Onde está o vídeo: no S3 (o enviado) ou no disco (o antigo). Erro se não existe.
  const fonte = async (espaco: Espaco, nome: string): Promise<FonteDoVideo> => {
    const limpo = path.basename(String(nome ?? ""));
    if (!limpo || limpo !== nome) throw new Error(`Vídeo não encontrado: ${nome}`);
    const prefixo = prefixoDe(espaco);
    if (armazenamento && prefixo && comS3(espaco) && (await armazenamento.existe(`${prefixo}${nome}`))) {
      return {onde: "s3", chave: `${prefixo}${nome}`};
    }
    if (espaco.videos().includes(nome)) {
      return {onde: "disco", caminho: path.join(espaco.pasta, nome)};
    }
    throw new Error(`Vídeo não encontrado: ${nome}`);
  };

  // Entrada para o ffmpeg e o ffprobe: o endereço assinado (S3) ou o caminho (disco).
  const entrada = async (espaco: Espaco, nome: string, segundos = 3600): Promise<string> => {
    const onde = await fonte(espaco, nome);
    return onde.onde === "s3" ? armazenamento!.enderecoDeLeitura(onde.chave, segundos) : onde.caminho;
  };

  // "Remover vídeo": no S3, apaga o vídeo, a prévia leve e a capa; no disco, move
  // para removidos/ (como sempre). Devolve onde ficou (disco) ou nada (S3).
  const remover = async (espaco: Espaco, nome: string): Promise<string | undefined> => {
    const onde = await fonte(espaco, nome);
    if (onde.onde === "s3") {
      const conta = espaco.usuario!.id;
      await armazenamento!.s3.send(
        new DeleteObjectsCommand({
          Bucket: armazenamento!.bucket,
          Delete: {
            Objects: [
              {Key: onde.chave},
              {Key: `${PASTAS_NO_BUCKET.previas.prefixo}${conta}/${nome}.mp4`},
              {Key: `${PASTAS_NO_BUCKET.previas.prefixo}${conta}/${nome}.jpg`},
            ],
          },
        }),
      );
      return undefined;
    }
    const pasta = path.join(espaco.pasta, PASTA_DE_REMOVIDOS);
    await mkdir(pasta, {recursive: true});
    const {name, ext} = path.parse(nome);
    let destino = path.join(pasta, nome);
    for (let n = 2; existsSync(destino); n++) destino = path.join(pasta, `${name} (${n})${ext}`);
    // No Windows o arquivo pode ficar preso por instantes (a prévia acabou de soltar).
    for (let tentativa = 1; ; tentativa++) {
      try {
        await rename(onde.caminho, destino);
        break;
      } catch (error) {
        const codigo = (error as NodeJS.ErrnoException).code;
        if (tentativa >= 10 || (codigo !== "EBUSY" && codigo !== "EPERM")) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    return path.relative(espaco.pasta, destino);
  };

  return {listar, fonte, entrada, remover};
};

export type VideosDasContas = ReturnType<typeof videosDasContas>;
