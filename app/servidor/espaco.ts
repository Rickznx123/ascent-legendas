// Onde ficam os vídeos e os projetos de quem fez o pedido.
// - Modo local (sem Supabase no .env): como sempre, os vídeos na pasta do projeto e
//   um único projeto no transcricao.json.
// - Com login: os vídeos em usuarios/<id do usuário>/ (até a Etapa 3, quando vão
//   para o S3) e um projeto por vídeo na tabela projetos do Supabase, lido e
//   gravado com o token do usuário (o RLS garante que cada um só vê os seus).
import {rmSync} from "node:fs";
import path from "node:path";
import {listarVideos, readProject, saveProject} from "../../src/motor/projeto";
import type {Projeto} from "../../src/motor/projeto";
import type {Contas, Usuario} from "./contas";

export type ResumoDoProjeto = {video: string; blocos: number};

export type Espaco = {
  // Usuário logado (sem login: undefined).
  usuario?: Usuario;
  // Pasta dos vídeos; saidas/ e removidos/ ficam dentro dela.
  pasta: string;
  videos: () => string[];
  // O projeto do vídeo (sem vídeo: o último editado). No modo local, sempre o do
  // transcricao.json, que pode ser de outro vídeo (a tela confere o source).
  lerProjeto: (video?: string) => Promise<Projeto | undefined>;
  salvarProjeto: (projeto: Projeto) => Promise<void>;
  // Apaga o projeto do vídeo; diz se havia um.
  apagarProjeto: (video: string) => Promise<boolean>;
  // Vídeos com projeto (para a lista do Início).
  projetos: () => Promise<ResumoDoProjeto[]>;
  // Registra um vídeo exportado (minutos do plano na Etapa 2b).
  registrarExportacao: (video: string, duracaoS: number) => Promise<void>;
};

export const espacoLocal = (root: string): Espaco => ({
  pasta: root,
  videos: () => listarVideos(root),
  lerProjeto: async () => readProject(root),
  salvarProjeto: async (projeto) => saveProject(root, projeto),
  apagarProjeto: async (video) => {
    const projeto = readProject(root);
    if (projeto?.source !== video) {
      return false;
    }
    rmSync(path.join(root, "transcricao.json"), {force: true});
    return true;
  },
  projetos: async () => {
    const projeto = readProject(root);
    return projeto ? [{video: projeto.source, blocos: projeto.blocks.length}] : [];
  },
  registrarExportacao: async () => undefined,
});

// Pasta do usuário no disco: só o id (um uuid) entra no caminho.
export const pastaDoUsuario = (root: string, usuario: Usuario): string => {
  if (!/^[0-9a-f-]{36}$/iu.test(usuario.id)) {
    throw new Error("Usuário inválido.");
  }
  return path.join(root, "usuarios", usuario.id);
};

type Linha = {id: string; video: string | null; dados: Projeto; atualizado_em: string};

export const espacoDoUsuario = (root: string, contas: Contas, usuario: Usuario, token: string): Espaco => {
  const pasta = pastaDoUsuario(root, usuario);
  const banco = contas.doUsuario(token);
  const falha = (acao: string, erro: {message: string}) => new Error(`Não foi possível ${acao}: ${erro.message}`);

  const linhaDoVideo = async (video: string): Promise<Linha | undefined> => {
    const {data, error} = await banco
      .from("projetos")
      .select("id, video, dados, atualizado_em")
      .eq("video", video)
      .order("atualizado_em", {ascending: false})
      .limit(1)
      .maybeSingle();
    if (error) throw falha("ler o projeto", error);
    return (data as Linha | null) ?? undefined;
  };

  return {
    usuario,
    pasta,
    videos: () => listarVideos(pasta),
    lerProjeto: async (video) => {
      if (video) {
        return (await linhaDoVideo(video))?.dados;
      }
      const {data, error} = await banco
        .from("projetos")
        .select("dados")
        .order("atualizado_em", {ascending: false})
        .limit(1)
        .maybeSingle();
      if (error) throw falha("ler o projeto", error);
      return (data as {dados: Projeto} | null)?.dados;
    },
    salvarProjeto: async (projeto) => {
      const campos = {
        nome: path.parse(projeto.source).name,
        dados: projeto,
        video: projeto.source,
        duracao_s: projeto.voz ? projeto.voz.duracaoMs / 1000 : null,
      };
      const existente = await linhaDoVideo(projeto.source);
      const {error} = existente
        ? await banco.from("projetos").update(campos).eq("id", existente.id)
        : await banco.from("projetos").insert({...campos, usuario_id: usuario.id});
      if (error) throw falha("salvar o projeto", error);
    },
    apagarProjeto: async (video) => {
      const {data, error} = await banco.from("projetos").delete().eq("video", video).select("id");
      if (error) throw falha("apagar o projeto", error);
      return (data ?? []).length > 0;
    },
    projetos: async () => {
      const {data, error} = await banco.from("projetos").select("video, blocos:dados->blocks").order("atualizado_em", {ascending: false});
      if (error) throw falha("listar os projetos", error);
      return (data as {video: string | null; blocos: unknown[] | null}[])
        .filter((linha): linha is {video: string; blocos: unknown[] | null} => Boolean(linha.video))
        .map((linha) => ({video: linha.video, blocos: Array.isArray(linha.blocos) ? linha.blocos.length : 0}));
    },
    registrarExportacao: async (video, duracaoS) => {
      const projeto = await linhaDoVideo(video);
      // Só o servidor insere em exportacoes (a chave secreta; o usuário só lê).
      const {error} = await contas.admin.from("exportacoes").insert({
        usuario_id: usuario.id,
        projeto_id: projeto?.id ?? null,
        duracao_s: duracaoS,
        com_marca_dagua: false,
      });
      if (error) throw falha("registrar a exportação", error);
    },
  };
};
