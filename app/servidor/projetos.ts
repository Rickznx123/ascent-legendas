// Projetos com timeline (PLANO-CORTES.md, Bloco 1). Um projeto tem um nome e uma
// lista de trechos de vídeos (a timeline); quando a pessoa vai legendar, o vídeo
// escolhido (ou, no Bloco 4, o montado) vai para projetos.video e o projeto de
// legendas de sempre (projetos.dados) passa a usar esse vídeo.
//   GET    /api/projetos                → {projetos, soltos}
//   POST   /api/projetos  {nome}        → {id}
//   GET    /api/projetos/:id            → o projeto, com a timeline
//   PUT    /api/projetos/:id  {nome?, timeline?}
//   POST   /api/projetos/:id/legendar {video}  "Pular": legenda o único vídeo, sem montar
//   DELETE /api/projetos/:id            apaga o projeto e os vídeos dele
// soltos: vídeos enviados antes, sem projeto (a tela abre direto as legendas).
import express from "express";
import type {Request, Response} from "express";
import type {Contas} from "./contas";
import type {Espaco} from "./espaco";
import type {VideosDasContas} from "./videos";

// inicioMs e fimMs: o pedaço do vídeo que entra (sem fimMs: até o fim do vídeo).
export type Trecho = {id: string; video: string; inicioMs: number; fimMs?: number};
// midia: todos os vídeos que já entraram no projeto (o servidor junta a cada PUT), para
// um vídeo tirado da timeline continuar do projeto (não vira "solto" e é apagado com ele).
export type Timeline = {trechos: Trecho[]; midia?: string[]};

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

type Linha = {id: string; nome: string; video: string | null; timeline: Timeline | null; atualizado_em: string; blocos?: unknown[] | null};

// Projeto antigo (sem timeline): 1 trecho com o vídeo inteiro.
export const timelineDe = (linha: Pick<Linha, "video" | "timeline">): Timeline =>
  linha.timeline ?? {trechos: linha.video ? [{id: "t1", video: linha.video, inicioMs: 0}] : []};

// Os vídeos do projeto: o das legendas, os da timeline e os que já passaram por ela.
const videosDe = (linha: Pick<Linha, "video" | "timeline">): string[] => {
  const timeline = timelineDe(linha);
  return [...new Set([linha.video, ...(timeline.midia ?? []), ...timeline.trechos.map((t) => t.video)].filter((nome): nome is string => Boolean(nome)))];
};

// A timeline nova, com a mídia de antes somada à de agora.
export const comMidia = (antes: Pick<Linha, "video" | "timeline">, nova: Timeline): Timeline => ({
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

export const rotasDeProjetos = ({contas, videos, espacoDe}: {contas: Contas; videos: VideosDasContas; espacoDe: (response: Response) => Espaco}) => {
  const rotas = express.Router();
  const bancoDe = (response: Response) => contas.doUsuario(response.locals.token as string);
  const falha = (acao: string, erro: {message: string}) => new Error(`Não foi possível ${acao}: ${erro.message}`);

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
        campos.timeline = comMidia(antes, nova);
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
      const {error} = await bancoDe(response).from("projetos").update({video}).eq("id", request.params.id);
      if (error) throw falha("salvar o projeto", error);
      return {video};
    }),
  );

  rotas.delete(
    "/:id",
    rota(async (request, response) => {
      const espaco = espacoDe(response);
      const l = await linha(response, request.params.id);
      // Um vídeo que já não existe não impede apagar o projeto.
      for (const nome of videosDe(l)) await videos.remover(espaco, nome).catch(() => undefined);
      const {error} = await bancoDe(response).from("projetos").delete().eq("id", l.id);
      if (error) throw falha("apagar o projeto", error);
      return {ok: true};
    }),
  );

  return rotas;
};
