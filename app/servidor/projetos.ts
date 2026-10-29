// Projetos com timeline (PLANO-CORTES.md, Bloco 1). Um projeto tem um nome e uma
// lista de trechos de vídeos (a timeline); quando a pessoa vai legendar, o vídeo
// escolhido (ou, no Bloco 4, o montado) vai para projetos.video e o projeto de
// legendas de sempre (projetos.dados) passa a usar esse vídeo.
//   GET    /api/projetos                → {projetos, soltos}
//   POST   /api/projetos  {nome}        → {id}
//   GET    /api/projetos/:id            → o projeto, com a timeline
//   PUT    /api/projetos/:id  {nome?, timeline?}
//   POST   /api/projetos/:id/legendar {video}  "Pular": legenda o único vídeo, sem montar
//   POST   /api/projetos/:id/audio      → {pausas, ondas} de cada vídeo da timeline (Bloco 3)
//   POST   /api/projetos/:id/montar     monta o vídeo dos cortes (Bloco 4; tarefa solta)
//   GET    /api/projetos/:id/montagem   andamento ou resultado ({montado}) da montagem
//   DELETE /api/projetos/:id            apaga o projeto e os vídeos dele
// soltos: vídeos enviados antes, sem projeto (a tela abre direto as legendas).
import {copyFile, mkdtemp, rm, stat} from "node:fs/promises";
import {createReadStream} from "node:fs";
import os from "node:os";
import path from "node:path";
import {PutObjectCommand} from "@aws-sdk/client-s3";
import express from "express";
import type {Request, Response} from "express";
import {assinaturaDosTrechos} from "../web/trechos";
import {PASTAS_NO_BUCKET} from "./configuracao";
import type {Contas} from "./contas";
import type {Espaco} from "./espaco";
import {LIMITES_DE_USO, entrarComAviso, filaComVagas} from "./limites";
import {lerFonte, montarVideo, nomeDoMontado} from "./montagem";
import type {FonteDaMontagem} from "./montagem";
import {analisarAudio} from "./pausas";
import type {Pausa} from "./pausas";
import type {PreviasLeves} from "./previa-leve";
import type {ArmazenamentoS3} from "./s3";
import {tarefasSoltas} from "./tarefas-soltas";
import type {VideosDasContas} from "./videos";

// inicioMs e fimMs: o pedaço do vídeo que entra (sem fimMs: até o fim do vídeo).
export type Trecho = {id: string; video: string; inicioMs: number; fimMs?: number};
// Só os trechos vêm da tela; o resto o servidor guarda e mantém a cada PUT:
// midia: todos os vídeos que já entraram no projeto, para um vídeo tirado da timeline
//   continuar do projeto (não vira "solto" e é apagado com ele);
// pausas e ondas: os silêncios e a forma de onda (picos a cada ONDA_MS, de 0 a 255, em
//   base64) de cada vídeo, lidos uma vez só;
// montado: o vídeo da última montagem e a assinatura dos trechos dela (a tela compara
//   com a timeline atual para saber se os cortes mudaram).
export type Timeline = {trechos: Trecho[]; midia?: string[]; pausas?: Record<string, Pausa[]>; ondas?: Record<string, string>; montado?: {video: string; dosTrechos: string}};

export type ResumoDeProjeto = {
  id: string;
  nome: string;
  // O vídeo das legendas (vazio: ainda na timeline).
  video: string | null;
  // O primeiro vídeo da timeline (a capa do cartão).
  capa: string | null;
  videos: number;
  etapa: "edicao" | "legendado";
  atualizadoEm: string;
};

export type ProjetoComTimeline = {id: string; nome: string; video: string | null; timeline: Timeline};

const MAXIMO_DE_TRECHOS = 500;
const ID_VALIDO = /^[0-9a-f-]{36}$/iu;
// Legendas apagadas (o vídeo do projeto mudou): o padrão da coluna, que não aceita null
// (sem blocks, lerProjeto trata como "ainda não transcrito").
const SEM_LEGENDAS = {};

type Linha = {id: string; nome: string; video: string | null; timeline: Timeline | null; atualizado_em: string; blocos?: unknown[] | null};

// Projeto antigo (sem timeline): 1 trecho com o vídeo inteiro.
export const timelineDe = (linha: Pick<Linha, "video" | "timeline">): Timeline =>
  linha.timeline ?? {trechos: linha.video ? [{id: "t1", video: linha.video, inicioMs: 0}] : []};

// Os vídeos do projeto: o das legendas, os da timeline e os que já passaram por ela.
const videosDe = (linha: Pick<Linha, "video" | "timeline">): string[] => {
  const timeline = timelineDe(linha);
  return [...new Set([linha.video, ...(timeline.midia ?? []), ...timeline.trechos.map((t) => t.video)].filter((nome): nome is string => Boolean(nome)))];
};

// A timeline nova: os trechos da tela, o que o servidor guarda e a mídia de antes somada à de agora.
export const timelineNova = (antes: Pick<Linha, "video" | "timeline">, nova: Timeline): Timeline => ({
  ...timelineDe(antes),
  trechos: nova.trechos,
  midia: [...new Set([...videosDe(antes), ...nova.trechos.map((t) => t.video)])],
});

const nomeValido = (nome: unknown): string => {
  const limpo = typeof nome === "string" ? nome.trim() : "";
  if (!limpo || limpo.length > 80) throw new Error("Dê um nome ao projeto (até 80 letras).");
  return limpo;
};

// A timeline que veio da tela: só o que se espera, com números válidos.
export const timelineValida = (corpo: unknown): Timeline => {
  const trechos = (corpo as {trechos?: unknown} | null)?.trechos;
  if (!Array.isArray(trechos) || trechos.length > MAXIMO_DE_TRECHOS) throw new Error("Timeline inválida.");
  return {
    trechos: trechos.map((t: Record<string, unknown>) => {
      const ms = (valor: unknown) => typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
      if (typeof t?.id !== "string" || !/^[\w-]{1,40}$/u.test(t.id) || typeof t.video !== "string" || !ms(t.inicioMs) || (t.fimMs !== undefined && (!ms(t.fimMs) || (t.fimMs as number) <= (t.inicioMs as number)))) {
        throw new Error("Timeline inválida.");
      }
      return {id: t.id, video: t.video, inicioMs: t.inicioMs as number, ...(t.fimMs === undefined ? {} : {fimMs: t.fimMs as number})};
    }),
  };
};

type Dependencias = {
  contas: Contas;
  videos: VideosDasContas;
  previas?: PreviasLeves;
  // Sem S3, o montado fica no disco da conta (como os vídeos antigos).
  armazenamento?: ArmazenamentoS3;
  espacoDe: (response: Response) => Espaco;
  // A fila das transcrições (as pausas também leem o áudio do vídeo inteiro).
  entrarNaFila: () => Promise<() => void>;
};

export const rotasDeProjetos = ({contas, videos, previas, armazenamento, espacoDe, entrarNaFila}: Dependencias) => {
  const rotas = express.Router();
  const bancoDe = (response: Response) => contas.doUsuario(response.locals.token as string);
  // O texto do banco vai só para o log; a tela recebe a frase em português.
  const falha = (acao: string, erro: {message: string}) => {
    console.log(`Projetos: ${acao}: ${erro.message}`);
    return new Error(`Não foi possível ${acao}. Tente de novo.`);
  };

  const rota =
    (fn: (request: Request, response: Response) => Promise<unknown>) =>
    async (request: Request, response: Response) => {
      try {
        if (!espacoDe(response).usuario) throw new Error("Entre na sua conta.");
        if (request.params.id !== undefined && !ID_VALIDO.test(request.params.id)) throw new Error("Projeto não encontrado.");
        response.json((await fn(request, response)) ?? {ok: true});
      } catch (erro) {
        response.status(400).json({mensagem: erro instanceof Error ? erro.message : String(erro)});
      }
    };

  // O projeto da conta (o RLS só deixa ler os próprios).
  const linha = async (response: Response, id: string): Promise<Linha> => {
    const {data, error} = await bancoDe(response).from("projetos").select("id, nome, video, timeline, atualizado_em").eq("id", id).maybeSingle();
    if (error) throw falha("ler o projeto", error);
    if (!data) throw new Error("Projeto não encontrado.");
    return data as Linha;
  };

  // Os vídeos citados precisam ser da conta.
  const conferirVideos = async (espaco: Espaco, nomes: string[]) => {
    for (const nome of new Set(nomes)) await videos.fonte(espaco, nome);
  };

  rotas.get(
    "/",
    rota(async (_request, response) => {
      const espaco = espacoDe(response);
      const [{data, error}, todos] = await Promise.all([
        bancoDe(response).from("projetos").select("id, nome, video, timeline, atualizado_em, blocos:dados->blocks").order("atualizado_em", {ascending: false}),
        videos.listar(espaco),
      ]);
      if (error) throw falha("listar os projetos (a migração 012 já rodou no Supabase?)", error);
      const linhas = data as Linha[];
      const usados = new Set(linhas.flatMap(videosDe));
      const projetos: ResumoDeProjeto[] = linhas.map((l) => {
        const {trechos} = timelineDe(l);
        return {
          id: l.id,
          nome: l.nome,
          video: l.video,
          capa: trechos[0]?.video ?? l.video,
          videos: new Set(trechos.map((t) => t.video)).size,
          etapa: Array.isArray(l.blocos) && l.blocos.length > 0 ? "legendado" : "edicao",
          atualizadoEm: l.atualizado_em,
        };
      });
      return {projetos, soltos: todos.filter((video) => !usados.has(video))};
    }),
  );

  rotas.post(
    "/",
    rota(async (request, response) => {
      const nome = nomeValido((request.body as {nome?: unknown} | undefined)?.nome);
      const {data, error} = await bancoDe(response)
        .from("projetos")
        .insert({nome, usuario_id: espacoDe(response).usuario!.id, timeline: {trechos: []}})
        .select("id")
        .single();
      if (error) throw falha("criar o projeto", error);
      return {id: (data as {id: string}).id};
    }),
  );

  rotas.get(
    "/:id",
    rota(async (request, response): Promise<ProjetoComTimeline> => {
      const l = await linha(response, request.params.id);
      return {id: l.id, nome: l.nome, video: l.video, timeline: timelineDe(l)};
    }),
  );

  rotas.put(
    "/:id",
    rota(async (request, response) => {
      const corpo = (request.body ?? {}) as {nome?: unknown; timeline?: unknown};
      const antes = await linha(response, request.params.id);
      const campos: {nome?: string; timeline?: Timeline} = {};
      if (corpo.nome !== undefined) campos.nome = nomeValido(corpo.nome);
      if (corpo.timeline !== undefined) {
        const nova = timelineValida(corpo.timeline);
        await conferirVideos(espacoDe(response), nova.trechos.map((t) => t.video));
        campos.timeline = timelineNova(antes, nova);
      }
      const {error} = await bancoDe(response).from("projetos").update(campos).eq("id", request.params.id);
      if (error) throw falha("salvar o projeto", error);
      return {ok: true};
    }),
  );

  rotas.post(
    "/:id/legendar",
    rota(async (request, response) => {
      const video = String((request.body as {video?: unknown} | undefined)?.video ?? "");
      const {trechos} = timelineDe(await linha(response, request.params.id));
      const inteiro = trechos.length === 1 && trechos[0].video === video && trechos[0].inicioMs === 0 && trechos[0].fimMs === undefined;
      if (!inteiro) throw new Error("Para legendar sem montar, a timeline precisa ter um vídeo só, sem cortes.");
      await videos.fonte(espacoDe(response), video);
      // Legendas de outro vídeo (um montado antes) não servem para este.
      const anterior = (await linha(response, request.params.id)).video;
      const {error} = await bancoDe(response)
        .from("projetos")
        .update(anterior === video ? {video} : {video, dados: SEM_LEGENDAS})
        .eq("id", request.params.id);
      if (error) throw falha("salvar o projeto", error);
      return {video};
    }),
  );

  // Áudio dos vídeos da timeline: lê a prévia leve (menos download que o original) de
  // cada vídeo ainda não analisado, uma vez só, na fila das transcrições, e guarda as
  // pausas ("Remover pausas" aplica como cortes comuns) e a forma de onda (canal A1).
  rotas.post(
    "/:id/audio",
    rota(async (request, response) => {
      const espaco = espacoDe(response);
      const {trechos, pausas = {}, ondas = {}} = timelineDe(await linha(response, request.params.id));
      const nomes = [...new Set(trechos.map((t) => t.video))];
      const novas: {pausas: Record<string, Pausa[]>; ondas: Record<string, string>} = {pausas: {}, ondas: {}};
      const faltam = nomes.filter((nome) => !pausas[nome] || ondas[nome] === undefined);
      if (faltam.length > 0) {
        const liberar = await entrarNaFila();
        try {
          for (const nome of faltam) {
            const previa = previas && espaco.usuario ? await previas.estado(espaco.usuario.id, nome) : undefined;
            const audio = await analisarAudio(previa?.estado === "pronta" ? previa.video : await videos.entrada(espaco, nome));
            novas.pausas[nome] = audio.pausas;
            novas.ondas[nome] = audio.onda;
          }
        } finally {
          liberar();
        }
        // Relida: a tela pode ter salvo outros trechos enquanto isso; só o áudio muda.
        const atual = timelineDe(await linha(response, request.params.id));
        const {error} = await bancoDe(response)
          .from("projetos")
          .update({timeline: {...atual, pausas: {...atual.pausas, ...novas.pausas}, ondas: {...atual.ondas, ...novas.ondas}}})
          .eq("id", request.params.id);
        if (error) throw falha("guardar o áudio dos vídeos", error);
      }
      const de = <T,>(guardado: Record<string, T>, novo: Record<string, T>) => Object.fromEntries(nomes.map((nome) => [nome, novo[nome] ?? guardado[nome]]));
      return {pausas: de(pausas, novas.pausas), ondas: de(ondas, novas.ondas)};
    }),
  );

  // O montado (e a prévia leve e a capa dele, já prontas) no S3, com o nome do projeto
  // como título; sem S3, na pasta da conta.
  const guardarMontado = async (espaco: Espaco, nome: string, arquivos: {video: string; previa: string; capa: string}, titulo: string) => {
    const conta = espaco.usuario!.id;
    if (!armazenamento) {
      await copyFile(arquivos.video, path.join(espaco.pasta, nome));
      return;
    }
    const enviar = async (arquivo: string, Key: string, ContentType: string, Metadata?: Record<string, string>) =>
      armazenamento.s3.send(
        new PutObjectCommand({Bucket: armazenamento.bucket, Key, Body: createReadStream(arquivo), ContentLength: (await stat(arquivo)).size, ContentType, Metadata}),
      );
    // O vídeo antes: a prévia e a capa só valem se forem mais novas que ele (previa-leve.ts).
    await enviar(arquivos.video, `${PASTAS_NO_BUCKET.videos.prefixo}${conta}/${nome}`, "video/mp4", {titulo: encodeURIComponent(titulo)});
    await enviar(arquivos.previa, `${PASTAS_NO_BUCKET.previas.prefixo}${conta}/${nome}.mp4`, "video/mp4");
    await enviar(arquivos.capa, `${PASTAS_NO_BUCKET.previas.prefixo}${conta}/${nome}.jpg`, "image/jpeg");
  };

  // "Gerar legendas": monta o vídeo dos trechos, solto do pedido (a tela acompanha
  // pelo GET /montagem e pode fechar). O montado vira projetos.video e as legendas
  // antigas (de outros cortes) saem; a tela pede a transcrição de sempre em seguida.
  // Parada 5 min sem progresso (fora da fila): cancelada, e a vaga volta para a fila.
  const montagens = tarefasSoltas({paradaMaximaMs: 5 * 60_000});
  const filaDeMontagens = filaComVagas(LIMITES_DE_USO.montagensAoMesmoTempo);
  const chaveDaMontagem = (response: Response, id: string) => `${espacoDe(response).usuario!.id}:projeto:${id}`;

  rotas.post(
    "/:id/montar",
    rota(async (request, response) => {
      const espaco = espacoDe(response);
      const id = request.params.id;
      const chave = chaveDaMontagem(response, id);
      const atual = montagens.emAndamento(chave);
      if (atual) return atual;
      const l = await linha(response, id);
      const {trechos, montado} = timelineDe(l);
      if (trechos.length === 0) throw new Error("Adicione um vídeo antes de gerar as legendas.");
      const nomes = [...new Set(trechos.map((t) => t.video))];
      await conferirVideos(espaco, nomes);
      return montagens.iniciar(
        chave,
        id,
        async (progresso, sinal) => {
          const liberar = await entrarComAviso(filaDeMontagens, progresso, () => montagens.estimativa(), sinal);
          const pasta = await mkdtemp(path.join(os.tmpdir(), "montagem-"));
          try {
            progresso("Lendo os vídeos...", 0);
            const fontes: Record<string, FonteDaMontagem> = {};
            // 6 h: o endereço assinado precisa durar a montagem inteira.
            for (const nome of nomes) fontes[nome] = await lerFonte(await videos.entrada(espaco, nome, 6 * 3600));
            const arquivos = await montarVideo(fontes, trechos, pasta, progresso, sinal);
            sinal.throwIfAborted();
            progresso("Guardando o vídeo montado...", 0.95);
            const nome = nomeDoMontado(id, montado?.video);
            await guardarMontado(espaco, nome, arquivos, l.nome);
            // Cancelada enquanto guardava: não troca o vídeo do projeto.
            sinal.throwIfAborted();
            // Relida: a tela pode ter salvo outros cortes enquanto isso (a assinatura diz quais foram montados).
            const agora = await linha(response, id);
            const {error} = await bancoDe(response)
              .from("projetos")
              .update({video: nome, dados: SEM_LEGENDAS, timeline: {...timelineDe(agora), montado: {video: nome, dosTrechos: assinaturaDosTrechos(trechos)}}})
              .eq("id", id);
            if (error) throw falha("salvar o vídeo montado no projeto", error);
            // O montado anterior não serve mais (os originais nunca são apagados aqui).
            if (montado?.video && montado.video !== nome) await videos.remover(espaco, montado.video).catch(() => undefined);
            return {montado: nome};
          } finally {
            liberar();
            await rm(pasta, {recursive: true, force: true});
          }
        },
        () => undefined,
      );
    }),
  );

  rotas.get(
    "/:id/montagem",
    rota(async (request, response) => montagens.ler(chaveDaMontagem(response, request.params.id)) ?? {estado: "nenhuma"}),
  );

  rotas.delete(
    "/:id",
    rota(async (request, response) => {
      const espaco = espacoDe(response);
      const l = await linha(response, request.params.id);
      // Vídeo que outro projeto da conta também usa fica (o mesmo arquivo enviado em
      // dois projetos tem um nome só no S3: apagar levava a mídia do outro junto).
      const {data: outros, error: erroDosOutros} = await bancoDe(response).from("projetos").select("video, timeline").neq("id", l.id);
      if (erroDosOutros) throw falha("apagar o projeto", erroDosOutros);
      const emUso = new Set((outros as Pick<Linha, "video" | "timeline">[]).flatMap(videosDe));
      // Um vídeo que já não existe não impede apagar o projeto.
      for (const nome of videosDe(l).filter((nome) => !emUso.has(nome))) await videos.remover(espaco, nome).catch(() => undefined);
      const {error} = await bancoDe(response).from("projetos").delete().eq("id", l.id);
      if (error) throw falha("apagar o projeto", error);
      return {ok: true};
    }),
  );

  return rotas;
};
