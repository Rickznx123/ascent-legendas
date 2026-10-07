import {existsSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {
  listPackages,
  listPalettes,
  loadPackage,
  loadPackageConfig,
  loadPalette,
} from "../template-loader";
import type {PackageRules} from "../rhythm";
import type {ConfigEfeitos} from "../sons";
import type {CaptionBlock, CaptionTemplate, EntradaLinear, Palette, VozDoAudio, Word} from "../types";
import {PACOTE_MISTO} from "./blocos";

export const WHISPER_MODEL = "small";

// Sincronia de um projeto novo (transcrição nova de um vídeo sem projeto):
// Sincronia precisa ligada e ajuste em 0 ms. Projetos existentes ficam como estão.
export const SINCRONIA_DE_PROJETO_NOVO = {sincroniaPrecisa: true, sincroniaMs: 0} as const;

// Conteúdo do transcricao.json, usado pelo terminal e pela interface.
export type Projeto = {
  source: string;
  language: string;
  model: string;
  pacote?: string;
  paleta?: string;
  // Semente do sorteio do modo misto: a prévia e o render sorteiam igual.
  semente?: number;
  // Efeitos sonoros: frequência e volume geral (sem valor: EFEITOS_PADRAO).
  efeitos?: ConfigEfeitos;
  // Sincronia das legendas em ms (positivo atrasa, negativo adianta). Sem valor:
  // AGRUPAMENTO_CONFIG.sincroniaMs.
  sincroniaMs?: number;
  // Sincronia precisa: as palavras grudam na voz do áudio e a troca de blocos
  // protege a última palavra (veja src/encaixe.ts e src/tempos.ts). Sem valor: desligada.
  sincroniaPrecisa?: boolean;
  // Trechos de voz do áudio (detectados na transcrição, veja src/motor/voz.ts).
  voz?: VozDoAudio;
  // Posição geral das legendas: centro do bloco em % da largura e da altura.
  // Sem valor: 50% × 68% (POSICAO_PADRAO).
  posicao?: {x: number; y: number};
  // Entrada dos lineares que aceitam letra por letra (pacote C). Sem valor: por palavra.
  entradaLinear?: EntradaLinear;
  // Blocos excluídos na interface (fora do vídeo; podem ser restaurados).
  excluidos?: CaptionBlock[];
  words: Word[];
  blocks: CaptionBlock[];
};

export type Estilo = {
  // Nome do pacote, ou "misto" para sortear entre todos.
  pacote: string;
  paleta: string;
  // Todos os layouts usáveis. No modo misto, com o pacote na frente ("b/b4").
  templates: Record<string, CaptionTemplate>;
  // Regras de cada pacote usado (um só, ou todos no modo misto).
  pacotes: Record<string, PackageRules>;
  // Paleta geral do vídeo.
  palette: Palette;
  // Todas as paletas, para a cor por bloco.
  paletas: Record<string, Palette>;
};

export const transcriptionPath = (root: string): string => path.join(root, "transcricao.json");
const templatesDirectory = (root: string): string => path.join(root, "templates");
const palettesDirectory = (root: string): string => path.join(root, "paletas");

export const readProject = (root: string): Projeto | undefined => {
  const file = transcriptionPath(root);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Projeto) : undefined;
};

export const saveProject = (root: string, projeto: Projeto): void => {
  writeFileSync(transcriptionPath(root), JSON.stringify(projeto, null, 2), "utf8");
};

// Vídeo exportado: saidas/<nome-do-video>-<pacote>-<paleta>.mp4
export const outputPathFor = (root: string, video: string, pacote: string, paleta: string): string =>
  path.join(root, "saidas", `${path.parse(video).name}-${pacote}-${paleta}.mp4`);

// Saída antiga, gravada na raiz antes da pasta saidas/.
const OLD_OUTPUT = "saida.mp4";

// Pacotes, paletas e vídeos disponíveis na pasta do projeto. Os vídeos são só os
// da raiz (a pasta saidas/ não entra) e sem o saida.mp4 antigo.
// Vídeos de uma pasta (sem o saida.mp4 antigo); a pasta pode não existir ainda.
export const listarVideos = (pasta: string): string[] =>
  existsSync(pasta)
    ? readdirSync(pasta)
        .filter((file) => /\.(mp4|mov|m4v|mkv|webm)$/iu.test(file) && file.toLowerCase() !== OLD_OUTPUT)
        .sort((left, right) => left.localeCompare(right))
    : [];

// pastaDosVideos: com login, a pasta do usuário (os templates continuam em root).
export const loadCatalog = (root: string, pastaDosVideos = root) => ({
  pacotes: listPackages(templatesDirectory(root)),
  paletas: listPalettes(palettesDirectory(root)),
  videos: listarVideos(pastaDosVideos),
});

// Escolhe um pacote ou paleta: o pedido, senão o salvo no transcricao.json,
// senão o padrão, senão o primeiro que existir.
export const chooseAvailable = (
  kind: "pacote" | "paleta",
  available: string[],
  requested: string | undefined,
  saved: string | undefined,
  preferred: string,
): string => {
  const where = kind === "pacote" ? "templates/pacote-<nome>/" : "paletas/<nome>.ts";
  if (available.length === 0) {
    throw new Error(`Nenhum ${kind} encontrado. Crie ${where}.`);
  }
  const name =
    requested ??
    (saved && available.includes(saved) ? saved : undefined) ??
    (available.includes(preferred) ? preferred : available[0]);
  if (!available.includes(name)) {
    throw new Error(`O ${kind} '${name}' não existe. Disponíveis: ${available.join(", ")}.`);
  }
  return name;
};

// Carrega os layouts, as regras do pacote e a paleta escolhidos.
export const loadStyle = async (
  root: string,
  requested: {pacote?: string; paleta?: string},
  saved?: Projeto,
): Promise<Estilo> => {
  const {pacotes, paletas} = loadCatalog(root);
  const misto =
    pacotes.length > 0 &&
    (requested.pacote === PACOTE_MISTO || (!requested.pacote && saved?.pacote === PACOTE_MISTO));
  const pacote = misto
    ? PACOTE_MISTO
    : chooseAvailable("pacote", pacotes, requested.pacote, saved?.pacote, "a");
  const paleta = chooseAvailable("paleta", paletas, requested.paleta, saved?.paleta, "branco");

  const usados = misto ? pacotes : [pacote];
  const regras: Record<string, PackageRules> = {};
  const templates: Record<string, CaptionTemplate> = {};
  for (const nome of usados) {
    const doPacote = await loadPackage(templatesDirectory(root), nome);
    const config = await loadPackageConfig(templatesDirectory(root), nome, doPacote);
    const prefix = misto ? `${nome}/` : "";
    regras[nome] = {name: nome, prefix, templates: doPacote, config};
    for (const [layout, template] of Object.entries(doPacote)) {
      templates[prefix + layout] = template;
    }
  }

  const todasAsPaletas: Record<string, Palette> = {};
  for (const nome of paletas) {
    todasAsPaletas[nome] = await loadPalette(palettesDirectory(root), nome);
  }
  return {pacote, paleta, templates, pacotes: regras, palette: todasAsPaletas[paleta], paletas: todasAsPaletas};
};
