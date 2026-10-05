// Comunicação da tela com o servidor local. Nada aqui depende de Node, então a
// mesma tela funciona no navegador e dentro do Electron.
import type {Estilo, Projeto} from "../../src/motor/projeto";
import type {ArquivoSom} from "../../src/sons";
import type {VideoMetadata, VozDoAudio} from "../../src/types";

export type Catalogo = {pacotes: string[]; paletas: string[]; videos: string[]};

export type Andamento = {etapa: string; fracao?: number};

const lerJson = async <T>(response: Response): Promise<T> => {
  const data = (await response.json()) as T & {mensagem?: string};
  if (!response.ok) {
    throw new Error(data.mensagem ?? `Erro ${response.status}`);
  }
  return data;
};

export const api = {
  catalogo: () => fetch("/api/catalogo").then((r) => lerJson<Catalogo>(r)),

  recarregar: () => fetch("/api/recarregar", {method: "POST"}).then((r) => lerJson<Catalogo>(r)),

  projeto: () =>
    fetch("/api/projeto")
      .then((r) => lerJson<{projeto: Projeto | null}>(r))
      .then((data) => data.projeto),

  salvar: (projeto: Projeto) =>
    fetch("/api/projeto", {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(projeto),
    }).then((r) => lerJson<{ok: boolean}>(r)),

  estilo: (pacote?: string, paleta?: string) => {
    const query = new URLSearchParams();
    if (pacote) query.set("pacote", pacote);
    if (paleta) query.set("paleta", paleta);
    return fetch(`/api/estilo?${query}`).then((r) => lerJson<Estilo>(r));
  },

  // Trechos de voz do áudio (Sincronia precisa num projeto sem a voz salva).
  voz: (nome: string) => fetch(`/api/voz?nome=${encodeURIComponent(nome)}`).then((r) => lerJson<VozDoAudio>(r)),

  videoInfo: (nome: string) =>
    fetch(`/api/video-info?nome=${encodeURIComponent(nome)}`).then((r) => lerJson<VideoMetadata>(r)),

  videoUrl: (nome: string) => `/media/${encodeURIComponent(nome)}`,

  // Tira o vídeo da lista (vai para removidos/) e apaga a transcrição dele.
  removerVideo: (nome: string) =>
    fetch("/api/remover-video", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({nome}),
    }).then((r) => lerJson<{movidoPara: string; apagouTranscricao: boolean}>(r)),

  sons: () => fetch("/api/sons").then((r) => lerJson<ArquivoSom[]>(r)),

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
  const response = await fetch(url, {
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
        | {tipo: "erro"; mensagem: string};
      if (evento.tipo === "progresso") {
        onAndamento({etapa: evento.etapa, fracao: evento.fracao});
      } else if (evento.tipo === "fim") {
        return evento.resultado;
      } else {
        throw new Error(evento.mensagem);
      }
    }
    if (done) {
      throw new Error("A tarefa terminou sem resposta do servidor.");
    }
  }
};
