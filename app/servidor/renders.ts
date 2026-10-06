// Exportação no Lambda (Etapa 3, bloco 6). Cada exportação vira uma linha da
// tabela renders (migração 005): o servidor dispara o render no Lambda com o site
// da versão do código (site-lambda.ts), o vídeo pelo endereço assinado do S3, e o
// arquivo pronto vai direto para exportados/<conta>/ no bucket dos vídeos.
// O vigia acompanha os renders em andamento (inclusive depois de o servidor
// reiniciar): no sucesso, registra a exportação (o desconto do plano só acontece
// aqui); na falha, apaga o arquivo parcial e não desconta.
// Tocar em Exportar com um render do mesmo vídeo em andamento devolve o mesmo.
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {getFunctions, getRenderProgress, renderMediaOnLambda} from "@remotion/lambda/client";
import type {AwsRegion} from "@remotion/lambda/client";
import {prepararSons} from "../../src/motor/pasta-sons";
import type {Projeto} from "../../src/motor/projeto";
import type {KineticCaptionVideoProps, VideoMetadata} from "../../src/types";
import {PASTAS_NO_BUCKET} from "./configuracao";
import type {Contas} from "./contas";
import type {DecisaoDeExportacao} from "./cota";
import type {Espaco} from "./espaco";
import type {ArmazenamentoS3} from "./s3";
import {siteDaVersao} from "./site-lambda";
import type {SiteDoLambda} from "./site-lambda";

// Decisões do bloco 6: função de 2048 MB; 60 quadros por Lambda até 90 s de vídeo
// e 200 acima disso; saída limitada a 1080 x 1920 (o lado maior a 1920 e o menor
// a 1080, mantendo a proporção).
export const LAMBDA = {
  memoriaMb: 2048,
  quadrosPorLambda: (duracaoS: number) => (duracaoS <= 90 ? 60 : 200),
  ladoMaior: 1920,
  ladoMenor: 1080,
  // Vigia: de quanto em quanto tempo pergunta o andamento ao Lambda.
  vigiaMs: 3000,
  // Render que não chegou a começar no Lambda (o servidor caiu no meio): falhou.
  semComecarMs: 10 * 60 * 1000,
};

// Tamanho da saída: cabe em 1080 x 1920 (deitado: 1920 x 1080), lados pares.
export const tamanhoDaSaida = (video: VideoMetadata): VideoMetadata => {
  const maior = Math.max(video.width, video.height);
  const menor = Math.min(video.width, video.height);
  const escala = Math.min(1, LAMBDA.ladoMaior / maior, LAMBDA.ladoMenor / menor);
  if (escala >= 1) return video;
  const par = (valor: number) => Math.max(2, Math.round((valor * escala) / 2) * 2);
  return {...video, width: par(video.width), height: par(video.height)};
};

// O que a tela recebe (o mesmo formato da exportação local, veja tarefas-soltas.ts).
export type ExportacaoNoLambda = {
  id: string;
  video: string;
  estado: "andamento" | "pronta" | "falhou";
  etapa?: string;
  fracao?: number;
  caminho?: string;
  // Endereços assinados do vídeo pronto: para ver/compartilhar e para baixar.
  url?: string;
  download?: string;
  mensagem?: string;
  codigo?: string;
};

type Linha = {
  id: string;
  usuario_id: string;
  projeto_id: string | null;
  video: string;
  situacao: "andamento" | "pronto" | "falhou";
  progresso: number;
  render_id: string | null;
  funcao: string | null;
  bucket_remotion: string | null;
  saida_chave: string;
  duracao_s: number;
  desconto_s: number;
  com_marca: boolean;
  erro: string | null;
  custo_usd: number | null;
  criado_em: string;
};

// O que montar a exportação devolve (a mesma conta do render local).
export type ExportacaoMontada = {
  props: Omit<KineticCaptionVideoProps, "videoSrc">;
  decisao?: DecisaoDeExportacao;
  duracaoS: number;
  pacote: string;
  paleta: string;
};

class ErroComCodigo extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string,
  ) {
    super(mensagem);
  }
}

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

export const rendersNoLambda = ({
  raiz,
  regiao,
  contas,
  armazenamento,
}: {
  raiz: string;
  regiao: AwsRegion;
  contas: Contas;
  armazenamento: ArmazenamentoS3;
}) => {
  const {s3, bucket: Bucket} = armazenamento;
  const banco = contas.admin;

  // Site e função, lidos de vez em quando (o site muda quando se roda nuvem:site).
  let lidoEm = 0;
  let pronto: {site?: SiteDoLambda; funcao?: string} = {};
  const prontoParaExportar = async (): Promise<{site: SiteDoLambda; funcao: string}> => {
    if (!pronto.site || !pronto.funcao || Date.now() - lidoEm > 60_000) {
      const [site, funcoes] = await Promise.all([siteDaVersao(raiz, regiao), getFunctions({region: regiao, compatibleOnly: true})]);
      const funcao = funcoes
        .filter((f) => f.memorySizeInMb === LAMBDA.memoriaMb)
        .sort((a, b) => b.timeoutInSeconds - a.timeoutInSeconds)[0]?.functionName;
      pronto = {site, funcao};
      lidoEm = Date.now();
    }
    if (!pronto.site) {
      throw new Error(
        "A exportação na nuvem ainda não está pronta para esta versão do app (falta publicar o site do Lambda: npm run nuvem:site). Tente de novo em alguns minutos.",
      );
    }
    if (!pronto.funcao) {
      throw new Error(`A exportação na nuvem não está configurada (falta a função de ${LAMBDA.memoriaMb} MB no Lambda).`);
    }
    return {site: pronto.site, funcao: pronto.funcao};
  };

  const assinar = (Key: string, nomeParaBaixar?: string) =>
    getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket,
        Key,
        ...(nomeParaBaixar ? {ResponseContentDisposition: `attachment; filename="${encodeURIComponent(nomeParaBaixar)}"`} : {}),
      }),
      {expiresIn: 3 * 3600},
    );

  const paraTela = async (linha: Linha): Promise<ExportacaoNoLambda> => {
    const nome = path.posix.basename(linha.saida_chave);
    if (linha.situacao === "pronto") {
      const [url, download] = await Promise.all([assinar(linha.saida_chave), assinar(linha.saida_chave, nome)]);
      return {id: linha.id, video: linha.video, estado: "pronta", fracao: 1, caminho: nome, url, download};
    }
    if (linha.situacao === "falhou") {
      return {id: linha.id, video: linha.video, estado: "falhou", mensagem: linha.erro ?? "Não deu para exportar. Tente de novo."};
    }
    return {
      id: linha.id,
      video: linha.video,
      estado: "andamento",
      etapa: linha.render_id ? "Gerando o vídeo na nuvem..." : "Preparando...",
      fracao: Number(linha.progresso) || 0,
    };
  };

  const ultimaDoVideo = async (usuarioId: string, video: string): Promise<Linha | undefined> => {
    const {data, error} = await banco
      .from("renders")
      .select("*")
      .eq("usuario_id", usuarioId)
      .eq("video", video)
      .order("criado_em", {ascending: false})
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível ler as exportações (a migração 005 já rodou no Supabase?): ${error.message}`);
    return (data as Linha | null) ?? undefined;
  };

  const atualizar = async (id: string, campos: Partial<Linha> & Record<string, unknown>) => {
    const {error} = await banco
      .from("renders")
      .update({...campos, atualizado_em: new Date().toISOString()})
      .eq("id", id);
    if (error) console.log(`Exportar: não deu para atualizar o render ${id}: ${error.message}`);
  };

  const falhar = async (linha: Pick<Linha, "id" | "saida_chave">, erro: string, custoUsd?: number) => {
    await atualizar(linha.id, {situacao: "falhou", erro, terminado_em: new Date().toISOString(), ...(custoUsd === undefined ? {} : {custo_usd: custoUsd})});
    // O arquivo parcial (se o Lambda chegou a gravar algo) sai do bucket.
    await s3.send(new DeleteObjectCommand({Bucket, Key: linha.saida_chave})).catch(() => undefined);
  };

  // Sons tocados (com o corte e o fade, veja somTocado em src/sons.ts): gerados aqui
  // e enviados à pasta pública do site, ao lado dos sons de sons/.
  const enviarSons = async (props: ExportacaoMontada["props"], site: SiteDoLambda) => {
    if (!props.efeitos?.length || !props.volumeEfeitos) return;
    const temp = mkdtempSync(path.join(os.tmpdir(), "legendas-sons-"));
    try {
      const tocados = await prepararSons(raiz, props.efeitos, props.video.fps, temp);
      const s3DoRemotion = new S3Client({region: regiao, credentials: s3.config.credentials});
      for (const arquivo of tocados) {
        await s3DoRemotion.send(
          new PutObjectCommand({
            Bucket: site.bucketDoRemotion,
            Key: `sites/${site.nome}/public/sons/${arquivo}`,
            Body: readFileSync(path.join(temp, arquivo)),
            ContentType: "audio/wav",
            ACL: "public-read",
          }),
        );
      }
    } finally {
      rmSync(temp, {recursive: true, force: true});
    }
  };

  // Pedidos sendo abertos agora (entre o pedido e a linha no banco), por conta e vídeo.
  const abrindo = new Map<string, Promise<ExportacaoNoLambda>>();

  // Começa a exportação (ou devolve a que está em andamento para este vídeo).
  const exportar = async (
    espaco: Espaco,
    projeto: Projeto,
    chaveDoVideo: string,
    montar: (entrada: string) => Promise<ExportacaoMontada>,
  ): Promise<ExportacaoNoLambda> => {
    const usuario = espaco.usuario!;
    const video = projeto.source;
    const chave = `${usuario.id}:${video}`;
    // A trava vale antes de qualquer espera: dois toques ao mesmo tempo esperam o
    // mesmo pedido (sem ela, os dois passariam pela consulta ao banco juntos).
    const jaAbrindo = abrindo.get(chave);
    if (jaAbrindo) return jaAbrindo;
    const abrir = (async (): Promise<ExportacaoNoLambda> => {
      const atual = await ultimaDoVideo(usuario.id, video);
      if (atual?.situacao === "andamento") {
        console.log(`Exportar: ${video} já está sendo exportado; o pedido acompanha o mesmo render.`);
        return paraTela(atual);
      }
      const {site, funcao} = await prontoParaExportar();
      // O vídeo pelo endereço assinado: o ffprobe mede agora; o Lambda lê durante o
      // render inteiro (vale 6 h).
      const entrada = await armazenamento.enderecoDeLeitura(chaveDoVideo, 6 * 3600);
      let montada: ExportacaoMontada;
      try {
        montada = await montar(entrada);
      } catch (erro) {
        // O plano não deixou (nem começa, nem fica registrado).
        const codigo = (erro as {codigo?: string}).codigo;
        if (codigo) return {id: `recusada-${Date.now()}`, video, estado: "falhou", mensagem: mensagem(erro), codigo};
        throw erro;
      }
      const props = {...montada.props, video: tamanhoDaSaida(montada.props.video)};
      const nomeDoArquivo = `${path.parse(video).name}-${montada.pacote}-${montada.paleta}.mp4`;
      const saidaChave = `${PASTAS_NO_BUCKET.exportados.prefixo}${usuario.id}/${nomeDoArquivo}`;
      const {data: projetoNoBanco} = await banco
        .from("projetos")
        .select("id")
        .eq("usuario_id", usuario.id)
        .eq("video", video)
        .order("atualizado_em", {ascending: false})
        .limit(1)
        .maybeSingle();
      const {data, error} = await banco
        .from("renders")
        .insert({
          usuario_id: usuario.id,
          projeto_id: (projetoNoBanco as {id: string} | null)?.id ?? null,
          video,
          situacao: "andamento",
          progresso: 0,
          saida_chave: saidaChave,
          duracao_s: montada.duracaoS,
          desconto_s: montada.decisao?.descontoS ?? 0,
          com_marca: montada.decisao?.comMarca ?? false,
          funcao,
          bucket_remotion: site.bucketDoRemotion,
        })
        .select("*")
        .single();
      if (error) throw new Error(`Não foi possível registrar a exportação (a migração 005 já rodou no Supabase?): ${error.message}`);
      const linha = data as Linha;
      // Dispara no Lambda sem segurar o pedido (o vigia acompanha daqui em diante).
      void (async () => {
        try {
          await enviarSons(props, site);
          const {renderId, bucketName} = await renderMediaOnLambda({
            region: regiao,
            functionName: funcao,
            serveUrl: site.serveUrl,
            composition: "CaptionedVideo",
            inputProps: {...props, videoSrc: entrada},
            codec: "h264",
            audioCodec: "aac",
            framesPerLambda: LAMBDA.quadrosPorLambda(montada.duracaoS),
            // O bucket dos vídeos não usa ACL (dono único dos arquivos): sem ACL na gravação.
            privacy: "no-acl",
            outName: {bucketName: Bucket, key: saidaChave},
            overwrite: true,
          });
          await atualizar(linha.id, {render_id: renderId, bucket_remotion: bucketName});
          console.log(`Exportar: ${video} no Lambda (render ${renderId}, ${LAMBDA.quadrosPorLambda(montada.duracaoS)} quadros por Lambda, ${props.video.width}x${props.video.height}).`);
        } catch (erro) {
          console.log(`Exportar: ${video} não começou no Lambda: ${mensagem(erro)}`);
          await falhar(linha, `Não deu para começar a exportação na nuvem (${mensagem(erro)}). Tente de novo.`);
        }
      })();
      return paraTela(linha);
    })();
    abrindo.set(chave, abrir);
    try {
      return await abrir;
    } finally {
      abrindo.delete(chave);
    }
  };

  // Andamento (ou resultado) da última exportação deste vídeo.
  const estado = async (espaco: Espaco, video: string): Promise<ExportacaoNoLambda | undefined> => {
    const linha = await ultimaDoVideo(espaco.usuario!.id, video);
    return linha ? paraTela(linha) : undefined;
  };

  // ---------- vigia ----------
  let vigiando = false;
  const vigiar = async () => {
    if (vigiando) return;
    vigiando = true;
    try {
      const {data, error} = await banco.from("renders").select("*").eq("situacao", "andamento");
      if (error) return;
      for (const linha of data as Linha[]) {
        if (!linha.render_id || !linha.funcao || !linha.bucket_remotion) {
          if (Date.now() - new Date(linha.criado_em).getTime() > LAMBDA.semComecarMs) {
            await falhar(linha, "A exportação não chegou a começar. Tente de novo.");
          }
          continue;
        }
        try {
          const progresso = await getRenderProgress({
            renderId: linha.render_id,
            bucketName: linha.bucket_remotion,
            functionName: linha.funcao,
            region: regiao,
          });
          if (progresso.fatalErrorEncountered) {
            const erro = progresso.errors[0]?.message ?? "erro no Lambda";
            console.log(`Exportar: render ${linha.render_id} (${linha.video}) falhou: ${erro}`);
            await falhar(linha, "A exportação falhou na nuvem. Nada foi descontado do seu plano; tente de novo.", progresso.costs.accruedSoFar);
          } else if (progresso.done) {
            // Primeiro marca como pronto (só um vigia ganha esta troca); só então
            // desconta. Se o servidor cair entre os dois, o desconto não acontece
            // (nunca desconta duas vezes).
            const {data: marcada} = await banco
              .from("renders")
              .update({situacao: "pronto", progresso: 1, custo_usd: progresso.costs.accruedSoFar, terminado_em: new Date().toISOString(), atualizado_em: new Date().toISOString()})
              .eq("id", linha.id)
              .eq("situacao", "andamento")
              .select("id");
            if ((marcada ?? []).length === 1) {
              const {error: erroDoRegistro} = await banco.from("exportacoes").insert({
                usuario_id: linha.usuario_id,
                projeto_id: linha.projeto_id,
                duracao_s: linha.duracao_s,
                descontado_s: linha.desconto_s,
                com_marca_dagua: linha.com_marca,
              });
              if (erroDoRegistro) console.log(`Exportar: não deu para registrar a exportação ${linha.id}: ${erroDoRegistro.message}`);
              console.log(
                `Exportar: ${linha.video} pronto no Lambda (custo US$ ${progresso.costs.accruedSoFar.toFixed(4)}, desconto ${Number(linha.desconto_s).toFixed(1)} s).`,
              );
            }
          } else if (Math.abs(progresso.overallProgress - Number(linha.progresso)) >= 0.01) {
            await atualizar(linha.id, {progresso: Number(progresso.overallProgress.toFixed(3))});
          }
        } catch (erro) {
          console.log(`Exportar: não deu para ler o andamento do render ${linha.render_id}: ${mensagem(erro)}`);
        }
      }
    } finally {
      vigiando = false;
    }
  };
  const vigia = setInterval(() => void vigiar(), LAMBDA.vigiaMs);
  vigia.unref();

  return {exportar, estado, vigiar, prontoParaExportar};
};

export type RendersNoLambda = ReturnType<typeof rendersNoLambda>;
export {ErroComCodigo};
