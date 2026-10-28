// Montagem do vídeo dos cortes (PLANO-CORTES.md, Bloco 4): os trechos da timeline
// viram um vídeo só, que passa a ser o vídeo das legendas do projeto (a transcrição,
// a prévia leve e a exportação de sempre funcionam com ele sem mudança).
// Como: cada trecho é cortado num arquivo à parte, um ffmpeg por vez (memória baixa
// mesmo com centenas de trechos depois de "Remover pausas", e só a parte usada do
// original é baixada do S3), todos no mesmo formato: tamanho do primeiro trecho (os
// outros com faixa preta), 30 quadros/s, H.264 e áudio PCM. O concat junta sem
// converter o vídeo de novo. O áudio PCM não soma o atraso que o AAC põe em cada
// emenda; cada trecho tem um número inteiro de quadros e o áudio a mesma duração,
// a mesma conta da prévia (trechos.ts). 15 ms de fade em cada corte: sem estalo.
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {execFileAsync, ffmpegPath, ffprobePath, getVideoMetadata} from "../../src/motor/ferramentas";
import {FPS, quadrosDe} from "../web/trechos";
import type {Duracoes} from "../web/trechos";
import {ESCALA, tirarCapa} from "./previa-leve";
import type {Trecho} from "./projetos";

export const MONTAGEM_CONFIG = {
  fadeMs: 15,
  // shortcut: lado menor limitado a 1080 px (um 4K inteiro no Render levaria muito); subir se o plano do Render crescer.
  ladoMenorMaximo: 1080,
  crf: 20,
};

const PRAZO_POR_TRECHO_MS = 10 * 60_000;
const PRAZO_DO_TODO_MS = 60 * 60_000;

export type FonteDaMontagem = {entrada: string; duracaoMs: number; largura: number; altura: number; temAudio: boolean};

// Duração, tamanho (como é exibido) e se tem áudio.
export const lerFonte = async (entrada: string): Promise<FonteDaMontagem> => {
  const [meta, {stdout}] = await Promise.all([
    getVideoMetadata(entrada),
    execFileAsync(ffprobePath(), ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", entrada]),
  ]);
  return {entrada, duracaoMs: (meta.durationInFrames / meta.fps) * 1000, largura: meta.width, altura: meta.height, temAudio: stdout.trim() !== ""};
};

// Lado menor até ladoMenorMaximo, o outro proporcional; os dois pares (o H.264 pede).
export const tamanhoDoMontado = (largura: number, altura: number) => {
  const escala = Math.min(1, MONTAGEM_CONFIG.ladoMenorMaximo / Math.min(largura, altura));
  const par = (n: number) => Math.max(2, Math.round((n * escala) / 2) * 2);
  return {largura: par(largura), altura: par(altura)};
};

// "projeto-<8 letras do id>-v<n>.mp4": cada montagem ganha um nome novo (o anterior é apagado depois).
export const nomeDoMontado = (projetoId: string, anterior?: string) => {
  const versao = Number(/-v(\d+)\.mp4$/u.exec(anterior ?? "")?.[1] ?? 0) + 1;
  return `projeto-${projetoId.slice(0, 8)}-v${versao}.mp4`;
};

export const argumentosDoTrecho = (fonte: FonteDaMontagem, trecho: Trecho, quadros: number, tamanho: {largura: number; altura: number}, saida: string): string[] => {
  const segundos = quadros / FPS;
  const fade = MONTAGEM_CONFIG.fadeMs / 1000;
  const {largura: w, altura: h} = tamanho;
  // tpad: um trecho que chega ao fim do vídeo nunca fica com quadros a menos.
  const video = `[0:v]fps=${FPS},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=1[v]`;
  const audio =
    `[${fonte.temAudio ? "0:a:0" : "1:a"}]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo,apad,atrim=0:${segundos},` +
    `afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, segundos - fade)}:d=${fade}[a]`;
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    // -ss e -t antes do -i: o ffmpeg só lê (e baixa) a parte do trecho.
    "-ss",
    String(trecho.inicioMs / 1000),
    "-t",
    String(segundos + 1),
    "-i",
    fonte.entrada,
    ...(fonte.temAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]),
    "-filter_complex",
    `${video};${audio}`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-frames:v",
    String(quadros),
    "-t",
    String(segundos),
    "-threads",
    "2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(MONTAGEM_CONFIG.crf),
    "-pix_fmt",
    "yuv420p",
    "-g",
    String(FPS * 2),
    "-c:a",
    "pcm_s16le",
    saida,
  ];
};

const ffmpeg = async (args: string[], timeout: number) => {
  const execucao = execFileAsync(ffmpegPath(), args, {maxBuffer: 16 * 1024 * 1024, timeout});
  // Prioridade baixa, como a prévia leve: o servidor segue respondendo.
  try {
    if (execucao.child.pid) (await import("node:os")).setPriority(execucao.child.pid, 15);
  } catch {
    // Sem permissão para mudar a prioridade: segue normal.
  }
  await execucao;
};

// Monta na pasta: video.mp4 (o montado), previa.mp4 (a prévia leve dele) e capa.jpg.
export const montarVideo = async (
  fontes: Record<string, FonteDaMontagem>,
  trechos: Trecho[],
  pasta: string,
  progresso: (etapa: string, fracao?: number) => void,
) => {
  const duracoes: Duracoes = Object.fromEntries(Object.entries(fontes).map(([nome, fonte]) => [nome, fonte.duracaoMs]));
  const quadros = quadrosDe(trechos, duracoes);
  const primeira = fontes[trechos[0].video];
  const tamanho = tamanhoDoMontado(primeira.largura, primeira.altura);
  const partes: string[] = [];
  for (const [i, trecho] of trechos.entries()) {
    progresso(`Cortando o trecho ${i + 1} de ${trechos.length}...`, (0.8 * i) / trechos.length);
    const parte = path.join(pasta, `parte-${String(i).padStart(4, "0")}.mkv`);
    await ffmpeg(argumentosDoTrecho(fontes[trecho.video], trecho, quadros[i], tamanho, parte), PRAZO_POR_TRECHO_MS);
    partes.push(parte);
  }
  progresso("Juntando os trechos...", 0.8);
  const lista = path.join(pasta, "lista.txt");
  await writeFile(lista, partes.map((parte) => `file '${parte.replace(/\\/gu, "/").replace(/'/gu, "'\\''")}'`).join("\n"));
  const video = path.join(pasta, "video.mp4");
  await ffmpeg(
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lista, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", video],
    PRAZO_DO_TODO_MS,
  );
  progresso("Preparando a prévia...", 0.85);
  const previa = path.join(pasta, "previa.mp4");
  await ffmpeg(
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      video,
      "-vf",
      ESCALA,
      "-threads",
      "2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      previa,
    ],
    PRAZO_DO_TODO_MS,
  );
  const capa = path.join(pasta, "capa.jpg");
  await tirarCapa(video, capa);
  return {video, previa, capa};
};
