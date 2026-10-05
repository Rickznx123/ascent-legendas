// O que muda entre o navegador e o Electron fica só aqui. No Electron, o preload
// expõe window.legendasElectron com as funções que devem substituir as do navegador
// (seletor nativo do Windows, "Salvar como", abrir pasta pelo shell).

export const EXTENSOES_DE_VIDEO = [".mp4", ".mov", ".mkv", ".webm"];

// Um vídeo escolhido pelo usuário, pronto para ser copiado para o projeto.
export type VideoEscolhido = {
  nome: string;
  // Copia para a pasta de vídeos do projeto e devolve o nome final do arquivo.
  importar: (substituir: boolean, onProgresso: (fracao: number) => void) => Promise<string>;
};

export type Plataforma = {
  nome: "navegador" | "electron";
  // Abre o seletor de arquivos de vídeo. galeria: no celular, oferece também a
  // galeria de fotos e vídeos do aparelho.
  escolherVideo: (opcoes?: {galeria?: boolean}) => Promise<VideoEscolhido | undefined>;
  // Transforma um arquivo arrastado para a janela num vídeo escolhido.
  videoArrastado: (arquivo: File) => VideoEscolhido | undefined;
  // Salva o vídeo exportado no computador do usuário.
  baixarExportado: (nomeDoArquivo: string) => void;
  // Abre a pasta saidas/ no explorador de arquivos.
  abrirPastaDeSaidas: () => Promise<void>;
};

export class ErroArquivoExiste extends Error {}

const ehVideo = (nome: string): boolean =>
  EXTENSOES_DE_VIDEO.some((extensao) => nome.toLowerCase().endsWith(extensao));

// Envia o arquivo ao servidor local, que o copia para a pasta do projeto.
const enviarArquivo = (
  arquivo: File,
  substituir: boolean,
  onProgresso: (fracao: number) => void,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const query = new URLSearchParams({nome: arquivo.name, substituir: substituir ? "1" : "0"});
    xhr.open("PUT", `/api/importar?${query}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgresso(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      const resposta = JSON.parse(xhr.responseText || "{}") as {nome?: string; mensagem?: string};
      if (xhr.status === 409) {
        reject(new ErroArquivoExiste(resposta.mensagem ?? "O arquivo já existe."));
      } else if (xhr.status >= 400 || !resposta.nome) {
        reject(new Error(resposta.mensagem ?? `Erro ${xhr.status}`));
      } else {
        resolve(resposta.nome);
      }
    };
    xhr.onerror = () => reject(new Error("Falha ao enviar o vídeo para o servidor local."));
    xhr.send(arquivo);
  });

const videoDoArquivo = (arquivo: File): VideoEscolhido | undefined =>
  ehVideo(arquivo.name)
    ? {nome: arquivo.name, importar: (substituir, onProgresso) => enviarArquivo(arquivo, substituir, onProgresso)}
    : undefined;

const navegador: Plataforma = {
  nome: "navegador",
  escolherVideo: (opcoes) =>
    new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = [...(opcoes?.galeria ? ["video/*"] : []), ...EXTENSOES_DE_VIDEO].join(",");
      input.onchange = () => resolve(input.files?.[0] ? videoDoArquivo(input.files[0]) : undefined);
      input.oncancel = () => resolve(undefined);
      input.click();
    }),
  videoArrastado: videoDoArquivo,
  baixarExportado: (nomeDoArquivo) => {
    const link = document.createElement("a");
    link.href = `/saidas/${encodeURIComponent(nomeDoArquivo)}`;
    link.download = nomeDoArquivo;
    link.click();
  },
  abrirPastaDeSaidas: async () => {
    const resposta = await fetch("/api/abrir-saidas", {method: "POST"});
    if (!resposta.ok) {
      const dados = (await resposta.json().catch(() => ({}))) as {mensagem?: string};
      throw new Error(dados.mensagem ?? "Não foi possível abrir a pasta saidas/.");
    }
  },
};

declare global {
  interface Window {
    legendasElectron?: Partial<Omit<Plataforma, "nome">>;
  }
}

export const plataforma: Plataforma = window.legendasElectron
  ? {...navegador, ...window.legendasElectron, nome: "electron"}
  : navegador;
