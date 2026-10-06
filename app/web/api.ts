// Comunicação da tela com o servidor local. Nada aqui depende de Node, então a
// mesma tela funciona no navegador e dentro do Electron.
import type {Estilo, Projeto} from "../../src/motor/projeto";
import type {ArquivoSom} from "../../src/sons";
import type {VideoMetadata, VozDoAudio} from "../../src/types";
import {tokenDaSessao} from "./sessao";
import type {TarefaSolta} from "./tarefas-soltas";

// Com login, todo pedido leva o token da sessão; um 401 (sessão expirada) avisa a
// tela para voltar ao login. Sem login, é o fetch de sempre.
export const EVENTO_SESSAO_EXPIRADA = "sessao-expirada";
export const pedir = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const token = tokenDaSessao();
  const resposta = await fetch(url, token ? {...init, headers: {...(init.headers ?? {}), Authorization: `Bearer ${token}`}} : init);
  if (resposta.status === 401 && token) {
    window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
  }
  return resposta;
};

// projetos: os vídeos que já têm projeto (com login, os do usuário).
// titulos: o nome de cada vídeo na tela (veja app/servidor/titulo.ts).
export type Catalogo = {
  pacotes: string[];
  paletas: string[];
  videos: string[];
  projetos?: {video: string; blocos: number}[];
  titulos?: Record<string, string>;
};

// Título do vídeo na tela; sem o do servidor, o nome do arquivo sem a extensão.
export const tituloDoVideo = (catalogo: Catalogo, video: string): string =>
  catalogo.titulos?.[video] ?? video.replace(/\.[^.]+$/u, "");

export type Plano = "gratis" | "assinante";
// Uso do plano e decisão de exportar: os mesmos tipos do servidor (só tipos; quem
// decide é o servidor, em app/servidor/cota.ts).
import type {DecisaoDeExportacao, UsoDoPlano} from "../servidor/cota";
export type {DecisaoDeExportacao, UsoDoPlano};
import type {EstadoDaPrevia} from "../servidor/previa-leve";
export type {EstadoDaPrevia};
export type Conta = {email: string; nome: string | null; plano: Plano; uso?: UsoDoPlano};

// Erro de uma tarefa com um código do servidor (ex.: "assine", "sem-saldo").
export class ErroDaTarefa extends Error {
  constructor(
    mensagem: string,
    readonly codigo?: string,
  ) {
    super(mensagem);
  }
}

export type Andamento = {etapa: string; fracao?: number};

// Tarefas no servidor, soltas da página (veja app/web/tarefas-soltas.ts).
export type Exportacao = TarefaSolta & {caminho?: string; descontoS?: number};
export type TranscricaoNoServidor = TarefaSolta & {projeto?: Projeto; avisos?: string[]};

const lerJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T & {mensagem?: string};
  if (!response.ok) {
    throw new Error(data.mensagem ?? `Erro ${response.status}`);
  }
  return data;
};

export const api = {
  catalogo: () => pedir("/api/catalogo").then((r) => lerJson<Catalogo>(r)),

  recarregar: () => pedir("/api/recarregar", {method: "POST"}).then((r) => lerJson<Catalogo>(r)),

  // O projeto de um vídeo (sem vídeo: o último editado). No modo local, sempre o
  // do transcricao.json, que pode ser de outro vídeo.
  projeto: (video?: string) =>
    pedir(`/api/projeto${video ? `?video=${encodeURIComponent(video)}` : ""}`)
      .then((r) => lerJson<{projeto: Projeto | null}>(r))
      .then((data) => data.projeto),

  // Conta logada (e-mail e plano do perfil); sem login, null.
  conta: () =>
    pedir("/api/conta")
      .then((r) => lerJson<{conta: Conta | null}>(r))
      .then((data) => data.conta),

  // O que exportar este vídeo vai fazer (descontar, marca d'água) ou por que não
  // pode. Sem login: semLimite.
  previaExportacao: (video: string) =>
    pedir(`/api/exportar/previa?video=${encodeURIComponent(video)}`).then((r) =>
      lerJson<DecisaoDeExportacao | {semLimite: true}>(r),
    ),

  // Exportação: começa (ou devolve a que já está em curso para este vídeo) e, depois,
  // o andamento ou o resultado. Ela segue no servidor mesmo com a página fechada.
  exportar: (video: string) =>
    pedir("/api/exportar", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({video})}).then((r) =>
      lerJson<Exportacao>(r),
    ),
  // Transcrição, do mesmo jeito: começa (ou devolve a que está em curso) e depois o
  // andamento ou o resultado. Sem transcrições no dia: erro com o motivo.
  transcrever: (corpo: {video: string; pacote?: string; paleta?: string; manterAjustes?: boolean}) =>
    pedir("/api/transcrever", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(corpo)}).then((r) =>
      lerJson<TranscricaoNoServidor>(r),
    ),
  transcricao: (video: string) =>
    pedir(`/api/transcricao?video=${encodeURIComponent(video)}`).then((r) =>
      lerJson<TranscricaoNoServidor | {estado: "nenhuma"}>(r),
    ),
  exportacao: (video: string) =>
    pedir(`/api/exportacao?video=${encodeURIComponent(video)}`).then((r) => lerJson<Exportacao | {estado: "nenhuma"}>(r)),

  // "Importar projetos deste computador": se está disponível para esta conta.
  importacaoLocal: () =>
    pedir("/api/importacao-local").then((r) =>
      lerJson<{disponivel: boolean; videos?: string[]; projeto?: string | null}>(r),
    ),

  salvar: (projeto: Projeto) =>
    pedir("/api/projeto", {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(projeto),
    }).then((r) => lerJson<{ok: boolean}>(r)),

  estilo: (pacote?: string, paleta?: string) => {
    const query = new URLSearchParams();
    if (pacote) query.set("pacote", pacote);
    if (paleta) query.set("paleta", paleta);
    return pedir(`/api/estilo?${query}`).then((r) => lerJson<Estilo>(r));
  },

  // Trechos de voz do áudio (Sincronia precisa num projeto sem a voz salva).
  voz: (nome: string) => pedir(`/api/voz?nome=${encodeURIComponent(nome)}`).then((r) => lerJson<VozDoAudio>(r)),

  videoInfo: (nome: string) =>
    pedir(`/api/video-info?nome=${encodeURIComponent(nome)}`).then((r) => lerJson<VideoMetadata>(r)),

  videoUrl: (nome: string) => `/media/${encodeURIComponent(nome)}`,

  // Prévia leve e capa do vídeo enviado ao S3 (veja app/servidor/previa-leve.ts).
  previa: (nome: string, tentarDeNovo = false) =>
    pedir(`/api/previa?nome=${encodeURIComponent(nome)}${tentarDeNovo ? "&tentar=1" : ""}`).then((r) => lerJson<EstadoDaPrevia>(r)),

  // Tira o vídeo da lista (vai para removidos/) e apaga a transcrição dele.
  removerVideo: (nome: string) =>
    pedir("/api/remover-video", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({nome}),
    }).then((r) => lerJson<{movidoPara: string; apagouTranscricao: boolean}>(r)),

  sons: () => pedir("/api/sons").then((r) => lerJson<ArquivoSom[]>(r)),

  // Endereço da pasta sons/ no servidor local.
  sonsUrl: "/sons/",

  somUrl: (arquivo: string) => `/sons/${arquivo.split("/").map(encodeURIComponent).join("/")}`,
};

// Tarefa longa: o servidor responde com uma linha JSON por evento de progresso.
export const executarTarefa = async <T>(
  url: string,
  body: unknown,
  onAndamento: (andamento: Andamento) => void,
): Promise<T> => {
  const response = await pedir(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    await lerJson(response);
    throw new Error(`Erro ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const {value, done} = await reader.read();
    buffer += decoder.decode(value, {stream: !done});
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      const evento = JSON.parse(line) as
        | {tipo: "progresso"; etapa: string; fracao?: number}
        | {tipo: "fim"; resultado: T}
        | {tipo: "erro"; mensagem: string; codigo?: string};
      if (evento.tipo === "progresso") {
        onAndamento({etapa: evento.etapa, fracao: evento.fracao});
      } else if (evento.tipo === "fim") {
        return evento.resultado;
      } else {
        throw new ErroDaTarefa(evento.mensagem, evento.codigo);
      }
    }
    if (done) {
      throw new Error("A tarefa terminou sem resposta do servidor.");
    }
  }
};
