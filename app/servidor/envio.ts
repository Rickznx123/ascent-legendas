// Envio do vídeo direto do navegador para o S3, em partes (Etapa 3, bloco 3). O
// servidor não recebe o vídeo: ele confere o plano, abre o envio, assina o endereço
// de cada parte e, no fim, fecha o envio e mede a duração de verdade.
//   POST /api/envio/iniciar   {nome, tamanho, duracaoS?, substituir?} → chave, número do envio, partes
//   POST /api/envio/assinar   {chave, envio, partes: [números]} → endereço assinado de cada parte
//   GET  /api/envio/partes    ?chave&envio → partes que já chegaram (retomada)
//   POST /api/envio/concluir  {chave, envio, partes: [{numero, etag}]} → {nome}
//   POST /api/envio/cancelar  {chave, envio}
// Limites do plano (LIMITES.envio): tamanho conferido ao abrir e depois de fechar;
// duração conferida ao abrir (a que o navegador mediu) e, valendo, pelo ffprobe no
// arquivo do S3. Fora do limite, o arquivo é apagado.
// O vídeo enviado fica só no S3 (desde o bloco 6): a lista, a prévia, a
// transcrição e a exportação leem de lá.
import path from "node:path";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import express from "express";
import type {Request, Response} from "express";
import {getVideoMetadata} from "../../src/motor/ferramentas";
import {PASTAS_NO_BUCKET} from "./configuracao";
import type {Contas} from "./contas";
import {LIMITES, duracaoEmTexto} from "./cota";
import type {Espaco} from "./espaco";
import type {PreviasLeves} from "./previa-leve";
import type {VideosDasContas} from "./videos";
import {idDoEnvio, registrarEnvio, segundos} from "./registro";
import {tituloDoVideo} from "./titulo";
import type {ArmazenamentoS3} from "./s3";

// Cada parte tem 5 MB (o mínimo do S3; a última, o que sobrar): numa interrupção,
// perde-se no máximo o que estava pela metade em cada parte em andamento.
export const TAMANHO_DA_PARTE = 5 * 1024 * 1024;
// Endereços assinados das partes valem 1 hora (o navegador pede de novo se vencer).
const VALIDADE_DA_ASSINATURA_S = 3600;

const EXTENSAO_DE_VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/iu;

class ErroDoEnvio extends Error {
  constructor(
    mensagem: string,
    readonly status = 400,
  ) {
    super(mensagem);
  }
}

const tipoDoVideo = (nome: string): string => {
  const extensao = path.extname(nome).toLowerCase();
  return extensao === ".mov" ? "video/quicktime" : extensao === ".webm" ? "video/webm" : extensao === ".mkv" ? "video/x-matroska" : "video/mp4";
};

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

// Nome do arquivo como fica na lista: só o nome (sem pastas), sem caracteres de controle.
const nomeSeguro = (nome: unknown): string => {
  const limpo = path.basename(String(nome ?? "")).replace(/[\u0000-\u001f\u007f\\/]/gu, "").trim();
  if (!EXTENSAO_DE_VIDEO.test(limpo) || limpo.toLowerCase() === "saida.mp4") {
    throw new ErroDoEnvio("Escolha um vídeo .mp4, .mov, .mkv ou .webm.");
  }
  return limpo;
};

export const rotasDeEnvio = ({
  contas,
  armazenamento,
  previas,
  videos,
  espacoDe,
}: {
  contas: Contas;
  armazenamento: ArmazenamentoS3;
  previas: PreviasLeves;
  videos: VideosDasContas;
  espacoDe: (response: Response) => Espaco;
}): express.Router => {
  const {s3, bucket: Bucket} = armazenamento;
  const rotas = express.Router();

  // No log do servidor, só o essencial: o vídeo que chegou e as recusas (com o motivo).
  const responder =
    (fn: (request: Request, response: Response, espaco: Espaco & {usuario: NonNullable<Espaco["usuario"]>}) => Promise<unknown>) =>
    async (request: Request, response: Response) => {
      try {
        const espaco = espacoDe(response);
        if (!espaco.usuario) {
          throw new ErroDoEnvio("Entre na sua conta para enviar vídeos.", 401);
        }
        response.json(await fn(request, response, espaco as Espaco & {usuario: NonNullable<Espaco["usuario"]>}));
      } catch (erro) {
        const status = erro instanceof ErroDoEnvio ? erro.status : 400;
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.log(`Envio: ${request.method} ${request.path} recusado (${status}): ${mensagem}`);
        response.status(status).json({mensagem});
      }
    };

  // Prefixo do usuário: nenhuma chave fora dele é aceita.
  const prefixoDe = (usuarioId: string) => `${PASTAS_NO_BUCKET.videos.prefixo}${usuarioId}/`;
  const chaveDoUsuario = (chave: unknown, usuarioId: string): string => {
    const texto = String(chave ?? "");
    if (!texto.startsWith(prefixoDe(usuarioId)) || texto.includes("..") || texto.slice(prefixoDe(usuarioId).length).includes("/")) {
      throw new ErroDoEnvio("Envio de outra conta.", 403);
    }
    return texto;
  };
  const limiteDo = async (usuario: NonNullable<Espaco["usuario"]>, token: string) => {
    const {plano} = await contas.perfil(usuario, token);
    return {plano, ...LIMITES.envio[plano]};
  };
  const textoDoPlano = (plano: string) => (plano === "assinante" ? "do plano Assinante" : "do plano grátis");

  rotas.post(
    "/iniciar",
    responder(async (request, response, espaco) => {
      const {nome: pedido, tamanho, duracaoS, substituir} = request.body as {nome?: string; tamanho?: number; duracaoS?: number; substituir?: boolean};
      const nome = nomeSeguro(pedido);
      const bytes = Number(tamanho);
      if (!Number.isFinite(bytes) || bytes <= 0) {
        throw new ErroDoEnvio("Arquivo vazio.");
      }
      const limite = await limiteDo(espaco.usuario, response.locals.token as string);
      if (bytes > limite.bytes) {
        throw new ErroDoEnvio(`Este vídeo tem ${megabytes(bytes)}; o limite ${textoDoPlano(limite.plano)} é ${megabytes(limite.bytes)} por vídeo.`, 413);
      }
      // A duração que o navegador mediu (a que vale é medida no fim, no servidor).
      if (Number.isFinite(Number(duracaoS)) && Number(duracaoS) > limite.segundos + 1) {
        throw new ErroDoEnvio(
          `Este vídeo tem ${duracaoEmTexto(Number(duracaoS))}; o limite ${textoDoPlano(limite.plano)} é ${duracaoEmTexto(limite.segundos)} por vídeo.`,
          413,
        );
      }
      if ((await videos.listar(espaco)).includes(nome) && !substituir) {
        throw new ErroDoEnvio(`Já existe um vídeo chamado ${nome}.`, 409);
      }
      const chave = `${prefixoDe(espaco.usuario.id)}${nome}`;
      // O nome com que o arquivo chegou e o título da tela ficam guardados no próprio
      // arquivo do S3 (metadados só aceitam ASCII: vão codificados). Veja titulo.ts.
      const Metadata = {"nome-original": encodeURIComponent(String(pedido)), titulo: encodeURIComponent(tituloDoVideo(nome, new Date()))};
      const {UploadId} = await s3.send(new CreateMultipartUploadCommand({Bucket, Key: chave, ContentType: tipoDoVideo(nome), Metadata}));
      return {chave, envio: UploadId, tamanhoDaParte: TAMANHO_DA_PARTE, partes: Math.ceil(bytes / TAMANHO_DA_PARTE)};
    }),
  );

  rotas.post(
    "/assinar",
    responder(async (request, _response, espaco) => {
      const {chave: pedida, envio, partes} = request.body as {chave?: string; envio?: string; partes?: number[]};
      const chave = chaveDoUsuario(pedida, espaco.usuario.id);
      // Até o máximo de partes do maior arquivo permitido (1 GB / 5 MB).
      const maximo = Math.ceil(LIMITES.envio.assinante.bytes / TAMANHO_DA_PARTE);
      const numeros = (partes ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= maximo);
      if (!envio || numeros.length === 0 || numeros.length > 20) {
        throw new ErroDoEnvio("Pedido de assinatura inválido.");
      }
      const enderecos = await Promise.all(
        numeros.map(async (numero) => ({
          numero,
          url: await getSignedUrl(s3, new UploadPartCommand({Bucket, Key: chave, UploadId: envio, PartNumber: numero}), {expiresIn: VALIDADE_DA_ASSINATURA_S}),
        })),
      );
      return {enderecos};
    }),
  );

  // Retomada: as partes que já chegaram ao S3 (o navegador manda só as que faltam).
  rotas.get(
    "/partes",
    responder(async (request, _response, espaco) => {
      const chave = chaveDoUsuario(request.query.chave, espaco.usuario.id);
      const envio = String(request.query.envio ?? "");
      try {
        const partes: {numero: number; etag: string}[] = [];
        let marcador: string | undefined;
        do {
          const lista = await s3.send(new ListPartsCommand({Bucket, Key: chave, UploadId: envio, PartNumberMarker: marcador}));
          partes.push(...(lista.Parts ?? []).map((p) => ({numero: p.PartNumber!, etag: p.ETag!})));
          marcador = lista.IsTruncated ? lista.NextPartNumberMarker : undefined;
        } while (marcador);
        return {existe: true, partes};
      } catch (erro) {
        // Envio fechado, cancelado ou apagado pela regra de 2 dias: começa de novo.
        if ((erro as {name?: string}).name === "NoSuchUpload") {
          return {existe: false, partes: []};
        }
        throw erro;
      }
    }),
  );

  rotas.post(
    "/concluir",
    responder(async (request, response, espaco) => {
      const {chave: pedida, envio, partes} = request.body as {chave?: string; envio?: string; partes?: {numero: number; etag: string}[]};
      const chave = chaveDoUsuario(pedida, espaco.usuario.id);
      const nome = chave.slice(prefixoDe(espaco.usuario.id).length);
      if (!envio || !partes?.length) {
        throw new ErroDoEnvio("Envio sem partes.");
      }
      const inicio = Date.now();
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket,
          Key: chave,
          UploadId: envio,
          MultipartUpload: {Parts: [...partes].sort((a, b) => a.numero - b.numero).map((p) => ({PartNumber: p.numero, ETag: p.etag}))},
        }),
      );
      // Confere o que chegou: tamanho e duração de verdade (o ffprobe lê pelo
      // endereço assinado, sem baixar o arquivo). Fora do limite: apaga.
      const limite = await limiteDo(espaco.usuario, response.locals.token as string);
      const apagar = () => s3.send(new DeleteObjectCommand({Bucket, Key: chave}));
      const {ContentLength = 0} = await s3.send(new HeadObjectCommand({Bucket, Key: chave}));
      if (ContentLength > limite.bytes) {
        await apagar();
        throw new ErroDoEnvio(`O vídeo enviado tem ${megabytes(ContentLength)}; o limite ${textoDoPlano(limite.plano)} é ${megabytes(limite.bytes)}.`, 413);
      }
      const juntar = segundos(inicio);
      const inicioDaConferencia = Date.now();
      let duracaoS: number;
      try {
        const metadados = await getVideoMetadata(await armazenamento.enderecoDeLeitura(chave, 600));
        duracaoS = metadados.durationInFrames / metadados.fps;
      } catch {
        await apagar();
        throw new ErroDoEnvio("Não deu para ler este arquivo como vídeo. Tente outro arquivo.");
      }
      if (duracaoS > limite.segundos + 1) {
        await apagar();
        throw new ErroDoEnvio(`Este vídeo tem ${duracaoEmTexto(duracaoS)}; o limite ${textoDoPlano(limite.plano)} é ${duracaoEmTexto(limite.segundos)} por vídeo.`, 413);
      }

      registrarEnvio(
        idDoEnvio(espaco.usuario.id, nome),
        `chegou: ${megabytes(ContentLength)}, ${duracaoEmTexto(duracaoS)}; juntar as partes ${juntar}, conferir com o ffprobe ${segundos(inicioDaConferencia)}`,
      );
      // Capa e prévia leve, sem esperar (a tela pergunta o estado em /api/previa).
      previas.gerar(espaco.usuario.id, nome);
      return {nome, duracaoS, bytes: ContentLength};
    }),
  );

  rotas.post(
    "/cancelar",
    responder(async (request, _response, espaco) => {
      const {chave: pedida, envio} = request.body as {chave?: string; envio?: string};
      const chave = chaveDoUsuario(pedida, espaco.usuario.id);
      await s3.send(new AbortMultipartUploadCommand({Bucket, Key: chave, UploadId: String(envio ?? "")})).catch(() => undefined);
      return {ok: true};
    }),
  );

  return rotas;
};
