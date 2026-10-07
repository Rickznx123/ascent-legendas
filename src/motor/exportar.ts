import {copyFileSync, mkdirSync, mkdtempSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";
import type {AssignedCaptionBlock, CaptionTemplate, EfeitoSonoro, EntradaLinear, Palette, SincroniaPrecisa, VideoMetadata} from "../types";
import {prepararSons} from "./pasta-sons";
import type {Progresso} from "./transcrever";

export type Exportacao = {
  root: string;
  inputPath: string;
  outputPath: string;
  blocks: AssignedCaptionBlock[];
  templates: Record<string, CaptionTemplate>;
  palette: Palette;
  // Todas as paletas, para os blocos com cor própria.
  palettes?: Record<string, Palette>;
  video: VideoMetadata;
  // Efeitos sonoros planejados (src/sons.ts) e volume geral de 0 a 100.
  efeitos?: EfeitoSonoro[];
  volumeEfeitos?: number;
  // Sincronia das legendas em ms (positivo atrasa, negativo adianta).
  sincroniaMs?: number;
  // Sincronia precisa (vazio: desligada).
  precisa?: SincroniaPrecisa;
  // Posição geral das legendas e instantes dos blocos excluídos.
  posicao?: {x: number; y: number};
  cortesMs?: number[];
  // Marca d'água do plano grátis (o servidor decide pelo plano da conta).
  marcaDagua?: boolean;
  // Entrada dos lineares que aceitam letra por letra (pacote C).
  entradaLinear?: EntradaLinear;
};

// Renderiza o MP4 final com as legendas.
export const renderVideo = async (
  {root, inputPath, outputPath, blocks, templates, palette, palettes, video, efeitos, volumeEfeitos, sincroniaMs, precisa, posicao, cortesMs, marcaDagua, entradaLinear}: Exportacao,
  onProgress: Progresso = () => undefined,
): Promise<void> => {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "legendas-dinamicas-"));
  try {
    mkdirSync(path.dirname(outputPath), {recursive: true});
    const publicDirectory = path.join(tempDirectory, "public");
    mkdirSync(publicDirectory);
    copyFileSync(inputPath, path.join(publicDirectory, "input-video.mp4"));
    // Os sons que os efeitos tocam, gerados em public/sons/ (veja somTocado em
    // src/sons.ts).
    await prepararSons(root, efeitos ?? [], video.fps, path.join(publicDirectory, "sons"));
    const inputProps = {
      videoSrc: "input-video.mp4",
      blocks,
      templates,
      palette,
      palettes,
      video,
      efeitos,
      volumeEfeitos,
      sincroniaMs,
      precisa,
      posicao,
      cortesMs,
      marcaDagua,
      entradaLinear,
    };

    onProgress("Preparando a composição...", 0);
    const serveUrl = await bundle({
      entryPoint: path.join(root, "src", "index.tsx"),
      publicDir: publicDirectory,
      onProgress: (percent) => onProgress("Preparando a composição...", percent / 100),
    });
    const composition = await selectComposition({serveUrl, id: "CaptionedVideo", inputProps});

    onProgress("Renderizando o vídeo...", 0);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: outputPath,
      inputProps,
      onProgress: ({progress}) => onProgress("Renderizando o vídeo...", progress),
    });
  } finally {
    rmSync(tempDirectory, {recursive: true, force: true});
  }
};
