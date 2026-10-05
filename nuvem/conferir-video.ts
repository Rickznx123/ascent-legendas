// npx tsx nuvem/conferir-video.ts <video.mp4> <pasta-de-saida> [--pacote misto]
// Os mesmos PNGs do "npm run conferir" (um por bloco, com todas as palavras na
// tela), mas de um vídeo já renderizado com as props de nuvem/props.ts. Serve para
// comparar renders (antes × depois, local × nuvem) bloco a bloco.
import path from "node:path";
import {exportBlockFrames} from "../src/motor/conferencia";
import {readProject} from "../src/motor/projeto";
import {RAIZ} from "./env";
import {montarProps} from "./props";

const [video, pasta] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!video || !pasta) {
  throw new Error("Uso: npx tsx nuvem/conferir-video.ts <video.mp4> <pasta-de-saida> [--pacote misto]");
}
const indice = process.argv.indexOf("--pacote");
const pacote = indice > 0 ? process.argv[indice + 1] : "misto";

const props = await montarProps(path.join(RAIZ, readProject(RAIZ)?.source ?? ""), {pacote});
await exportBlockFrames(props.blocks, props.templates, path.resolve(video), path.resolve(pasta), props.video.fps, props.sincroniaMs, props.cortesMs);
