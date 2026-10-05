// npx tsx nuvem/testar-pedaco.ts <saida.aac> --inicio 1152 --fim 1724 [--emenda]
// Renderiza no computador só o áudio de um trecho de quadros, como um pedaço do
// Lambda (--emenda liga forSeamlessAacConcatenation, o modo dos pedaços do Lambda).
// Serve para reproduzir sem custo o que acontece com os sons nos pedaços da nuvem.
import {copyFileSync, mkdirSync, mkdtempSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";
import {prepararSons} from "../src/motor/pasta-sons";
import {readProject} from "../src/motor/projeto";
import {RAIZ} from "./env";
import {montarProps} from "./props";

const valor = (opcao: string) => {
  const indice = process.argv.indexOf(opcao);
  return indice > 0 ? process.argv[indice + 1] : undefined;
};
const saida = path.resolve(process.argv[2] ?? "");
const inicio = Number(valor("--inicio"));
const fim = Number(valor("--fim"));

const inputPath = path.join(RAIZ, readProject(RAIZ)?.source ?? "");
const props = await montarProps(inputPath, {pacote: "misto"});
const temp = mkdtempSync(path.join(os.tmpdir(), "legendas-pedaco-"));
try {
  const publica = path.join(temp, "public");
  mkdirSync(publica);
  copyFileSync(inputPath, path.join(publica, "input-video.mp4"));
  await prepararSons(RAIZ, props.efeitos ?? [], props.video.fps, path.join(publica, "sons"));
  const serveUrl = await bundle({entryPoint: path.join(RAIZ, "src", "index.tsx"), publicDir: publica});
  const inputProps = {...props, videoSrc: "input-video.mp4"};
  const composition = await selectComposition({serveUrl, id: "CaptionedVideo", inputProps});
  await renderMedia({
    composition,
    serveUrl,
    codec: "aac",
    outputLocation: saida,
    inputProps,
    frameRange: [inicio, fim],
    forSeamlessAacConcatenation: process.argv.includes("--emenda"),
  });
  console.log(`Áudio dos quadros ${inicio}-${fim} em ${saida}`);
} finally {
  rmSync(temp, {recursive: true, force: true});
}
