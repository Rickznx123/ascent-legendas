import {existsSync} from "node:fs";
import path from "node:path";
import {groupWords} from "./captions";
import {assignForStyle, markShortBlocks, novaSemente, regroupAndPreserveManualFields} from "./motor/blocos";
import {exportBlockFrames} from "./motor/conferencia";
import {listarSons} from "./motor/pasta-sons";
import {renderVideo} from "./motor/exportar";
import {getVideoMetadata} from "./motor/ferramentas";
import {carregarEnv} from "./motor/env";
import {loadStyle, outputPathFor, readProject, saveProject, transcriptionPath} from "./motor/projeto";
import type {Projeto} from "./motor/projeto";
import {transcrever} from "./motor/transcricao";
import {detectarVozDoVideo} from "./motor/voz";
import {configDosEfeitos, planejarEfeitos} from "./sons";
import {cortesDosExcluidos, precisaoDoProjeto, sincroniaDoProjeto} from "./entrada";
import type {CaptionBlock, VozDoAudio, Word} from "./types";

const projectRoot = process.cwd();
// Chaves do Replicate e da Groq (transcrição).
carregarEnv(projectRoot);

type CommandOptions = {
  inputPath: string;
  // Sem caminho informado: saidas/<nome-do-video>-<pacote>-<paleta>.mp4
  outputPath?: string;
  templateChoice?: string;
  packageChoice?: string;
  paletteChoice?: string;
  reuseTranscription: boolean;
  regroup: boolean;
  exportReviewFrames: boolean;
  // Transcrever com o Whisper local (sem internet), em vez do WhisperX.
  local: boolean;
};

const parseCommandOptions = (argumentsList: string[]): CommandOptions => {
  const positionalArguments: string[] = [];
  let templateChoice: string | undefined;
  let packageChoice: string | undefined;
  let paletteChoice: string | undefined;
  let reuseTranscription = false;
  let regroup = false;
  let exportReviewFrames = false;
  let local = false;
  const readValue = (index: number, option: string): string => {
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Informe um nome depois de ${option}.`);
    }
    return value;
  };

  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];
    if (argument === "--template") {
      templateChoice = readValue(index, argument);
      index++;
    } else if (argument === "--pacote") {
      packageChoice = readValue(index, argument);
      index++;
    } else if (argument === "--paleta") {
      paletteChoice = readValue(index, argument);
      index++;
    } else if (argument === "--usar-transcricao") {
      reuseTranscription = true;
    } else if (argument === "--reagrupar") {
      regroup = true;
    } else if (argument === "--conferir") {
      exportReviewFrames = true;
    } else if (argument === "--local") {
      local = true;
    } else if (argument.startsWith("--")) {
      throw new Error(`Opção desconhecida: ${argument}`);
    } else {
      positionalArguments.push(argument);
    }
  }

  const [inputArgument, outputArgument] = positionalArguments;
  if (!inputArgument) {
    throw new Error(
      "Uso: npm run gerar -- <video-entrada.mp4> [arquivo-de-saida.mp4] [--pacote nome] [--paleta nome] [--template nome|alternar] [--usar-transcricao] [--reagrupar] [--conferir] [--local]",
    );
  }

  return {
    inputPath: path.resolve(inputArgument),
    outputPath: outputArgument ? path.resolve(outputArgument) : undefined,
    templateChoice,
    packageChoice,
    paletteChoice,
    reuseTranscription,
    regroup,
    exportReviewFrames,
    local,
  };
};

const main = async () => {
  const options = parseCommandOptions(process.argv.slice(2));
  const {inputPath} = options;
  if (!existsSync(inputPath)) {
    throw new Error(`O vídeo de entrada não existe: ${inputPath}`);
  }

  const video = await getVideoMetadata(inputPath);
  let saved: Projeto | undefined;
  if (options.reuseTranscription) {
    saved = readProject(projectRoot);
    if (!saved) {
      throw new Error("transcricao.json não existe para reutilizar.");
    }
    if (saved.source !== path.basename(inputPath)) {
      throw new Error(
        `transcricao.json pertence a '${saved.source}', não a '${path.basename(inputPath)}'.`,
      );
    }
  }

  const style = await loadStyle(
    projectRoot,
    {pacote: options.packageChoice, paleta: options.paletteChoice},
    saved,
  );
  console.log(`Pacote: ${style.pacote} · Paleta: ${style.paleta}`);
  const outputPath =
    options.outputPath ?? outputPathFor(projectRoot, path.basename(inputPath), style.pacote, style.paleta);
  if (inputPath.toLowerCase() === outputPath.toLowerCase()) {
    throw new Error("O arquivo de saída precisa ter um nome diferente do original.");
  }

  let words: Word[];
  let blocks: CaptionBlock[];
  let voz: VozDoAudio | undefined = saved?.voz;
  let model = saved?.model ?? "";
  if (saved) {
    words = saved.words;
    // Os blocos salvos são usados como estão (inclusive junções e divisões feitas
    // à mão). Com --reagrupar, a divisão é refeita a partir das palavras.
    const savedBlocks = saved.blocks ?? [];
    blocks =
      options.regroup || savedBlocks.length === 0
        ? regroupAndPreserveManualFields(words, savedBlocks)
        : savedBlocks;
    console.log(
      options.regroup
        ? "Reutilizando transcricao.json e refazendo a divisão..."
        : "Reutilizando transcricao.json editado...",
    );
  } else {
    // WhisperX, com a Groq e o Whisper local de reserva (src/motor/transcricao.ts).
    const transcricao = await transcrever(projectRoot, inputPath, {
      onProgress: (etapa) => console.log(etapa),
      ...(options.local ? {local: true} : {}),
    });
    ({words, voz, model} = transcricao);
    blocks = groupWords(words);
  }

  // Projeto transcrito antes da detecção de voz: detecta agora, se a Sincronia
  // precisa estiver ligada.
  if (!voz && saved?.sincroniaPrecisa) {
    voz = await detectarVozDoVideo(inputPath);
  }

  // No modo misto, a semente salva repete o mesmo sorteio da interface.
  const semente = saved?.semente ?? novaSemente();
  const chosenBlocks = assignForStyle(blocks, style, {
    semente,
    // Ao trocar de pacote, os templates salvos são de outro pacote: escolhe de novo.
    preserveAssignments: options.reuseTranscription && saved?.pacote === style.pacote,
    templateChoice: options.templateChoice,
  });
  // Com os blocos salvos, a divisão não muda: blocos curtos demais só ficam marcados.
  const assignedBlocks = saved && !options.regroup ? markShortBlocks(chosenBlocks) : chosenBlocks;

  saveProject(projectRoot, {
    source: path.basename(inputPath),
    language: "pt",
    model,
    pacote: style.pacote,
    paleta: style.paleta,
    semente,
    efeitos: saved?.efeitos,
    sincroniaMs: saved?.sincroniaMs,
    sincroniaPrecisa: saved?.sincroniaPrecisa,
    voz,
    posicao: saved?.posicao,
    excluidos: saved?.excluidos,
    words,
    blocks: assignedBlocks,
  });
  console.log(`Transcrição salva em ${transcriptionPath(projectRoot)}`);

  const efeitos = configDosEfeitos(saved?.efeitos);
  const sincroniaMs = sincroniaDoProjeto(saved?.sincroniaMs, saved?.sincroniaPrecisa);
  const precisa = precisaoDoProjeto(saved && {...saved, voz}, video.fps);
  const cortesMs = cortesDosExcluidos(saved?.excluidos, style.templates, sincroniaMs, precisa);
  let lastStage = "";
  await renderVideo(
    {
      root: projectRoot,
      inputPath,
      outputPath,
      blocks: assignedBlocks,
      templates: style.templates,
      palette: style.palette,
      palettes: style.paletas,
      video,
      efeitos: planejarEfeitos(assignedBlocks, style.templates, await listarSons(projectRoot), efeitos, semente, sincroniaMs, cortesMs, precisa),
      volumeEfeitos: efeitos.volume,
      sincroniaMs,
      precisa,
      posicao: saved?.posicao,
      cortesMs,
    },
    (etapa) => {
      if (etapa !== lastStage) {
        console.log(etapa);
        lastStage = etapa;
      }
    },
  );
  console.log(`Vídeo criado em ${outputPath}`);

  if (options.exportReviewFrames) {
    const reviewDirectory = path.join(projectRoot, "conferencia");
    await exportBlockFrames(assignedBlocks, style.templates, outputPath, reviewDirectory, video.fps, sincroniaMs, cortesMs, precisa);
    console.log(`Conferência exportada em ${reviewDirectory}`);
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Erro: ${message}`);
  process.exitCode = 1;
});
