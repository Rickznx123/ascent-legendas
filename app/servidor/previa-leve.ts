// Prévia leve e capa de cada vídeo enviado ao S3 (Etapa 3, bloco 4). Logo depois
// do envio, o servidor gera:
//   previas/<conta>/<nome>.jpg  capa (um quadro do começo), feita primeiro, para a
//                               tela já ter o que mostrar enquanto a prévia sai;
//   previas/<conta>/<nome>.mp4  cópia em H.264 com o lado menor em 540 px, que
//                               toca em qualquer navegador (o original pode ser
//                               HEVC) e pesa menos no celular.
// O ffmpeg aplica a rotação do original uma vez só (o arquivo gerado já sai em pé,
// sem marca de rotação). O render final continua usando o original.
// A tela pergunta o estado (GET /api/previa) e recebe endereços assinados de
// leitura; enquanto a prévia não fica pronta, mostra a capa e pergunta de novo.
// Conversões na fila (LIMITES_DE_USO.previasAoMesmoTempo, padrão 1): a tela mostra a
// posição. O ffmpeg roda com prioridade baixa: o servidor segue respondendo.
import {createReadStream, existsSync} from "node:fs";
import {mkdtemp, rm, stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {GetObjectCommand, HeadObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {execFileAsync, ffmpegPath} from "../../src/motor/ferramentas";
import {PASTAS_NO_BUCKET} from "./configuracao";
import {LIMITES_DE_USO, filaComVagas} from "./limites";
import type {ArmazenamentoS3} from "./s3";

export type EstadoDaPrevia =
  // Vídeo só no disco (ou sem S3): a tela usa o endereço de sempre (/media).
  // capa: JPG feito pelo servidor a partir do arquivo no disco (GET /capa/<nome>).
  | {estado: "local"; capa?: string}
  // fila: posição na fila das conversões (vazio: já convertendo).
  | {estado: "preparando"; capa?: string; fila?: number}
  | {estado: "falhou"; mensagem: string; capa?: string}
  | {estado: "pronta"; video: string; capa?: string};

// Prazo do ffmpeg: travado, ele é encerrado (e não prende a fila para sempre).
const PRAZO_DA_CAPA_MS = 60_000;
const PRAZO_DA_PREVIA_MS = 15 * 60_000;

// Lado menor da prévia leve, em px.
const LADO_MENOR = 540;
// Os endereços são assinados no começo da hora e valem 3 h: o mesmo endereço durante
// a hora inteira (o navegador aproveita o cache) e sempre ao menos 2 h de validade.
const VALIDADE_S = 3 * 3600;

// Lado menor em LADO_MENOR (sem aumentar vídeo menor), o outro proporcional e par.
const ESCALA =
  `scale=w='if(gt(iw,ih),-2,trunc(min(${LADO_MENOR},iw)/2)*2)'` + `:h='if(gt(iw,ih),trunc(min(${LADO_MENOR},ih)/2)*2,-2)'`;

// Capa: um quadro perto do começo (vídeo curtinho: o primeiro), já em pé, com o
// lado menor em 540 px. Também usada para os vídeos que só existem no disco.
export const tirarCapa = async (entrada: string, saida: string) => {
  for (const segundo of ["0.5", "0"]) {
    await execFileAsync(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", "-ss", segundo, "-i", entrada, "-frames:v", "1", "-vf", ESCALA, "-q:v", "4", saida], {timeout: PRAZO_DA_CAPA_MS}).catch(
      () => undefined,
    );
    if (existsSync(saida)) return;
  }
  throw new Error("o ffmpeg não tirou a capa");
};

const horario = () => new Date().toLocaleTimeString("pt-BR", {hour12: false});

export const previasLeves = (armazenamento: ArmazenamentoS3) => {
  const {s3, bucket: Bucket} = armazenamento;
  const chaves = (usuarioId: string, nome: string) => ({
    original: `${PASTAS_NO_BUCKET.videos.prefixo}${usuarioId}/${nome}`,
    video: `${PASTAS_NO_BUCKET.previas.prefixo}${usuarioId}/${nome}.mp4`,
    capa: `${PASTAS_NO_BUCKET.previas.prefixo}${usuarioId}/${nome}.jpg`,
  });
  // Conversões pedidas e ainda não terminadas, e as que falharam (com o motivo).
  const emAndamento = new Set<string>();
  const falhas = new Map<string, string>();
  const fila = filaComVagas(LIMITES_DE_USO.previasAoMesmoTempo);
  const posicoes = new Map<string, number>();

  const quandoMudou = async (Key: string): Promise<Date | undefined> => {
    try {
      const {LastModified} = await s3.send(new HeadObjectCommand({Bucket, Key}));
      return LastModified ?? new Date(0);
    } catch (erro) {
      if ((erro as {name?: string}).name === "NotFound" || (erro as {$metadata?: {httpStatusCode?: number}}).$metadata?.httpStatusCode === 404) {
        return undefined;
      }
      throw erro;
    }
  };

  const assinar = (Key: string) => {
    const inicioDaHora = new Date();
    inicioDaHora.setMinutes(0, 0, 0);
    return getSignedUrl(s3, new GetObjectCommand({Bucket, Key}), {expiresIn: VALIDADE_S, signingDate: inicioDaHora});
  };

  const enviar = async (arquivo: string, Key: string, ContentType: string) => {
    const {size} = await stat(arquivo);
    await s3.send(new PutObjectCommand({Bucket, Key, Body: createReadStream(arquivo), ContentLength: size, ContentType}));
  };

  const converter = async (usuarioId: string, nome: string, origemLocal?: string) => {
    const {original, video, capa} = chaves(usuarioId, nome);
    // A cópia no disco (até o Bloco 6) é lida mais rápido; sem ela, o S3.
    const entrada = origemLocal && existsSync(origemLocal) ? origemLocal : await armazenamento.enderecoDeLeitura(original, 3600);
    const pasta = await mkdtemp(path.join(os.tmpdir(), "previa-"));
    const inicio = Date.now();
    try {
      const arquivoDaCapa = path.join(pasta, "capa.jpg");
      await tirarCapa(entrada, arquivoDaCapa);
      await enviar(arquivoDaCapa, capa, "image/jpeg");
      const msCapa = Date.now() - inicio;

      const arquivoDaPrevia = path.join(pasta, "previa.mp4");
      const conversao = execFileAsync(
        ffmpegPath(),
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          // Duas threads na leitura e na gravação: o pico de memória cai quase pela
          // metade (medido: 1080p ~120 MB, 4K ~240 MB), para caber no servidor.
          "-threads",
          "2",
          "-i",
          entrada,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-vf",
          ESCALA,
          "-threads",
          "2",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "26",
          "-profile:v",
          "main",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "96k",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          arquivoDaPrevia,
        ],
        {maxBuffer: 16 * 1024 * 1024, timeout: PRAZO_DA_PREVIA_MS},
      );
      // Prioridade baixa: com 1 CPU, a conversão não tira a vez das rotas (nem da saúde).
      try {
        if (conversao.child.pid) os.setPriority(conversao.child.pid, 15);
      } catch {
        // Sem permissão para mudar a prioridade: segue normal.
      }
      await conversao;
      const {size} = await stat(arquivoDaPrevia);
      await enviar(arquivoDaPrevia, video, "video/mp4");
      console.log(
        `[previa ${horario()}] ${nome}: capa em ${msCapa} ms, prévia leve em ${Date.now() - inicio} ms (${(size / 1024 / 1024).toFixed(1)} MB)`,
      );
    } finally {
      await rm(pasta, {recursive: true, force: true});
    }
  };

  // Põe a conversão na fila (não espera terminar). origemLocal: a cópia no disco.
  const gerar = (usuarioId: string, nome: string, origemLocal?: string) => {
    const id = `${usuarioId}/${nome}`;
    if (emAndamento.has(id)) {
      return;
    }
    emAndamento.add(id);
    falhas.delete(id);
    void fila
      .entrar((posicao) => posicoes.set(id, posicao))
      .then((liberar) => {
        posicoes.delete(id);
        return converter(usuarioId, nome, origemLocal).finally(liberar);
      })
      .catch((erro: unknown) => {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        console.log(`[previa ${horario()}] ${nome}: falhou: ${mensagem}`);
        falhas.set(id, "Não deu para preparar a prévia deste vídeo.");
      })
      .finally(() => {
        emAndamento.delete(id);
        posicoes.delete(id);
      });
  };

  // Estado da prévia de um vídeo. Vídeo no S3 sem prévia (enviado antes do bloco 4,
  // ou o servidor reiniciou no meio): a conversão começa agora.
  const estado = async (usuarioId: string, nome: string, origemLocal?: string, tentarDeNovo = false): Promise<EstadoDaPrevia> => {
    const id = `${usuarioId}/${nome}`;
    const {original, video, capa} = chaves(usuarioId, nome);
    // Lido antes de consultar o S3: uma conversão que termina durante a consulta
    // não pode parecer "sem prévia" (e começar outra).
    const estavaPreparando = emAndamento.has(id);
    const [dataDoOriginal, dataDaPrevia, dataDaCapa] = await Promise.all([quandoMudou(original), quandoMudou(video), quandoMudou(capa)]);
    if (!dataDoOriginal) {
      return {estado: "local"};
    }
    // Prévia e capa de um envio anterior com o mesmo nome não valem.
    const capaAtual = dataDaCapa && dataDaCapa >= dataDoOriginal ? await assinar(capa) : undefined;
    if (estavaPreparando || emAndamento.has(id)) {
      return {estado: "preparando", capa: capaAtual, fila: posicoes.get(id)};
    }
    if (falhas.has(id) && !tentarDeNovo) {
      return {estado: "falhou", mensagem: falhas.get(id)!, capa: capaAtual};
    }
    if (dataDaPrevia && dataDaPrevia >= dataDoOriginal) {
      return {estado: "pronta", video: await assinar(video), capa: capaAtual};
    }
    gerar(usuarioId, nome, origemLocal);
    return {estado: "preparando", capa: capaAtual, fila: posicoes.get(id)};
  };

  // Para a saúde e o log: conversões rodando e esperando.
  return {gerar, estado, fila: () => ({rodando: fila.ocupadas(), esperando: fila.esperando()})};
};

export type PreviasLeves = ReturnType<typeof previasLeves>;
