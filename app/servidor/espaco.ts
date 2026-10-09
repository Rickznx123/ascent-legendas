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
import {decidirExportacao, decidirTranscricao, diaDoCalendario, usoDeTranscricoes, usoDoPlano} from "./cota";
import type {CicloDoPlano, DecisaoDeExportacao, RegistroDeExportacao, UsoDeTranscricoes, UsoDoPlano} from "./cota";
import type {Plano} from "./contas";
import {cicloDoPix} from "./pix";
import {planoPago} from "./planos";

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
  // Limites do plano (só com login; no modo local, sem limite nem marca d'água).
  cota?: Cota;
};

export type Cota = {
  // Uso do plano agora (quadro do Início, menu da conta).
  uso: () => Promise<UsoDoPlano>;
  // O que exportar este vídeo vai fazer (descontar quanto, com marca ou não), ou
  // por que não pode. duracaoS: a duração do arquivo, medida no servidor.
  decidir: (video: string, duracaoS: number) => Promise<DecisaoDeExportacao>;
  // Grava a exportação que terminou, com o que foi decidido antes do render.
  registrar: (video: string, duracaoS: number, decisao: DecisaoDeExportacao) => Promise<void>;
  // Transcrições: se ainda pode hoje (com o motivo, se não) e o registro de uma que
  // terminou (só as que terminaram contam).
  podeTranscrever: () => Promise<{permitido: boolean; motivo?: string; uso: UsoDeTranscricoes}>;
  registrarTranscricao: (video: string, motor: string, duracaoS: number) => Promise<void>;
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

  // Plano do perfil e histórico de exportações, lidos com a chave secreta (o
  // usuário não muda nenhum dos dois).
  const plano = async () => (await contas.perfil(usuario, token)).plano;
  // Ciclo pago da assinatura ou do Pix (só de quem paga pelo Mercado Pago; veja
  // cota.ts e pix.ts).
  // segundos: os minutos do nível do assinante (planos.ts).
  const planoECiclo = async (): Promise<{plano: Plano; ciclo?: CicloDoPlano; segundos: number}> => {
    const perfil = await contas.perfil(usuario, token);
    const {plano_origem, ciclo_inicio, ciclo_fim} = perfil.assinatura;
    const ciclo =
      perfil.plano !== "assinante"
        ? undefined
        : plano_origem === "pix"
          ? cicloDoPix(perfil.assinatura, new Date())
          : plano_origem === "assinatura" && ciclo_inicio && ciclo_fim
            ? {inicio: new Date(ciclo_inicio), fim: new Date(ciclo_fim)}
            : undefined;
    return {plano: perfil.plano, ciclo, segundos: planoPago(perfil.assinatura.nivel ?? "basico").minutos * 60};
  };
  const historico = async (): Promise<RegistroDeExportacao[]> => {
    const {data, error} = await contas.admin
      .from("exportacoes")
      .select("projeto_id, duracao_s, descontado_s, criado_em")
      .eq("usuario_id", usuario.id);
    if (error) throw falha("ler as exportações", error);
    return data as RegistroDeExportacao[];
  };

  // Transcrições que terminaram hoje (dia de Brasília). Lidas com a chave secreta.
  const transcricoesDeHoje = async (agora: Date): Promise<number> => {
    const {count, error} = await contas.admin
      .from("transcricoes")
      // Sem head: numa tabela que não existe, o head volta sem erro e sem contagem
      // (o limite ficaria desligado sem ninguém saber).
      .select("id", {count: "exact"})
      .eq("usuario_id", usuario.id)
      .gte("criado_em", diaDoCalendario(agora).inicio.toISOString())
      .limit(1);
    if (error || count === null) {
      throw falha("ler as transcrições de hoje (a migração 004 já rodou no Supabase?)", error ?? {message: "sem contagem"});
    }
    return count;
  };

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
    cota: {
      uso: async () => {
        const agora = new Date();
        const [{plano: p, ciclo, segundos}, h, hoje] = await Promise.all([planoECiclo(), historico(), transcricoesDeHoje(agora).catch(() => undefined)]);
        // Sem a tabela (migração 004 ainda não rodou), o quadro só não mostra as transcrições.
        return {...usoDoPlano(p, h, agora, ciclo, segundos), ...(hoje === undefined ? {} : {transcricoes: usoDeTranscricoes(p, hoje, agora)})};
      },
      podeTranscrever: async () => {
        const agora = new Date();
        const [p, hoje] = await Promise.all([plano(), transcricoesDeHoje(agora)]);
        const uso = usoDeTranscricoes(p, hoje, agora);
        return {...decidirTranscricao(uso, p), uso};
      },
      registrarTranscricao: async (video, motor, duracaoS) => {
        // Só o servidor insere em transcricoes (a chave secreta; o usuário só lê).
        const {error} = await contas.admin.from("transcricoes").insert({usuario_id: usuario.id, video, motor, duracao_s: duracaoS});
        if (error) throw falha("registrar a transcrição", error);
      },
      decidir: async (video, duracaoS) => {
        const [{plano: p, ciclo, segundos}, h, projeto] = await Promise.all([planoECiclo(), historico(), linhaDoVideo(video)]);
        return decidirExportacao(p, h, projeto?.id ?? null, duracaoS, new Date(), ciclo, segundos);
      },
      registrar: async (video, duracaoS, decisao) => {
        const projeto = await linhaDoVideo(video);
        // Só o servidor insere em exportacoes (a chave secreta; o usuário só lê).
        const {error} = await contas.admin.from("exportacoes").insert({
          usuario_id: usuario.id,
          projeto_id: projeto?.id ?? null,
          duracao_s: duracaoS,
          descontado_s: decisao.descontoS,
          com_marca_dagua: decisao.comMarca,
        });
        if (error) throw falha("registrar a exportação", error);
      },
    },
  };
};
