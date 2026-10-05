import {mkdirSync} from "node:fs";
import path from "node:path";
import {blocosNaTela} from "../entrada";
import {computeTimeline} from "../tempos";
import type {AssignedCaptionBlock, CaptionTemplate} from "../types";
import {execFileAsync, ffmpegPath} from "./ferramentas";

const slugifyExpectedText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/gu, "");

// Um PNG por bloco, no momento em que todas as palavras já entraram.
export const exportBlockFrames = async (
  blocosDaFala: AssignedCaptionBlock[],
  templates: Record<string, CaptionTemplate>,
  videoPath: string,
  outputDirectory: string,
  fps: number,
  sincroniaMs = 0,
  cortesMs: number[] = [],
): Promise<void> => {
  mkdirSync(outputDirectory, {recursive: true});
  // Mesmos tempos de tela do render.
  const blocks = blocosNaTela(blocosDaFala, templates, sincroniaMs);
  const timeline = computeTimeline(blocks, cortesMs);

  for (const [index, block] of blocks.entries()) {
    const template = templates[block.template];
    if (!template) {
      throw new Error(`O bloco ${index + 1} referencia um template inexistente: ${block.template}`);
    }
    const {showMs, hideMs} = timeline[index];
    const animationDurationFrames = Math.max(
      1,
      ...[template.animations.word, template.animations.keyword].map((animation) =>
        Math.round((animation.durationMs / 1000) * fps),
      ),
    );
    // Cada palavra anima a partir da própria fala ou da entrada do bloco, o que vier depois.
    const allWordsVisibleFrame = Math.max(
      ...block.words.map(
        (word) =>
          Math.round((Math.max(word.startMs, showMs) / 1000) * fps) + animationDurationFrames,
      ),
    );
    // Margem de 2 quadros: a busca do ffmpeg pode cair um quadro adiante, já no bloco seguinte.
    const firstFrameInBlock = Math.round((showMs / 1000) * fps);
    const lastFrameInBlock = Math.max(firstFrameInBlock, Math.ceil((hideMs / 1000) * fps) - 3);
    const frame = Math.min(allWordsVisibleFrame, lastFrameInBlock);
    const expectedText = block.words.map((word) => word.text).join(" ");
    const fileName = `${String(index + 1).padStart(3, "0")}-${slugifyExpectedText(expectedText)}.png`;
    const imagePath = path.join(outputDirectory, fileName);

    await execFileAsync(ffmpegPath(), [
      "-y",
      "-ss",
      (frame / fps).toFixed(3),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-update",
      "1",
      imagePath,
    ]);
    console.log(`Quadro ${index + 1}/${blocks.length}: ${imagePath}`);
  }
};
