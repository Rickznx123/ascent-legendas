// npx tsx nuvem/comparar-sons.ts <local.mp4> <nuvem.mp4> [--pacote misto] [--paleta nome]
//   [--projeto projeto.json --video arquivo.mp4]
// Compara efeito por efeito o áudio de dois renders do mesmo projeto: o ataque
// (primeiros 30 ms, em janelas de 5 ms) e o som inteiro, e marca onde diferem.
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import path from "node:path";
import {ffmpegPath} from "../src/motor/ferramentas";
import {quadrosDoEfeito} from "../src/sons";
import {readProject} from "../src/motor/projeto";
import type {Projeto} from "../src/motor/projeto";
import {RAIZ} from "./env";
import {montarProps} from "./props";

const valor = (opcao: string) => {
  const indice = process.argv.indexOf(opcao);
  return indice > 0 ? process.argv[indice + 1] : undefined;
};
const [local, nuvem] = process.argv.slice(2, 4).map((arquivo) => path.resolve(arquivo));
// Projeto salvo à parte (o mesmo do render), como em nuvem/renderizar.ts.
const arquivoDoProjeto = valor("--projeto");
const projeto = arquivoDoProjeto ? (JSON.parse(readFileSync(path.resolve(arquivoDoProjeto), "utf8")) as Projeto) : undefined;
if (!local || !nuvem) {
  throw new Error("Uso: npx tsx nuvem/comparar-sons.ts <local.mp4> <nuvem.mp4>");
}

// Volume (dB) em janelas de 5 ms a partir de inicio.
const envelope = (arquivo: string, inicio: number, duracao: number): number[] => {
  const {stdout} = spawnSync(
    ffmpegPath(),
    [
      "-hide_banner", "-ss", inicio.toFixed(4), "-t", duracao.toFixed(4), "-i", arquivo, "-vn",
      "-af", "aresample=48000,asetnsamples=240,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
      "-f", "null", "-",
    ],
    {encoding: "utf8"},
  );
  return [...stdout.matchAll(/RMS_level=(-?[\d.]+|-inf)/gu)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1])));
};

const video = valor("--video") ? path.resolve(valor("--video")!) : path.join(RAIZ, (projeto ?? readProject(RAIZ))?.source ?? "");
const props = await montarProps(video, {pacote: valor("--pacote") ?? "misto", paleta: valor("--paleta")}, projeto);
const {fps} = props.video;
let diferentes = 0;
for (const efeito of props.efeitos ?? []) {
  const {inicio, quadros} = quadrosDoEfeito(efeito, fps);
  const t = inicio / fps;
  const ataqueL = envelope(local, t, 0.03);
  const ataqueN = envelope(nuvem, t, 0.03);
  const inteiroL = envelope(local, t, quadros / fps);
  const inteiroN = envelope(nuvem, t, quadros / fps);
  const maiorAtaque = Math.max(...ataqueL.map((v, i) => Math.abs(v - (ataqueN[i] ?? v))));
  const media = (a: number[]) => 10 * Math.log10(a.reduce((s, v) => s + 10 ** (v / 10), 0) / Math.max(1, a.length));
  const difInteiro = Math.abs(media(inteiroL) - media(inteiroN));
  const marca = maiorAtaque > 3 || difInteiro > 1 ? "  <-- diferente" : "";
  if (marca) {
    diferentes++;
  }
  console.log(
    `${t.toFixed(2).padStart(6)}s ${efeito.arquivo.padEnd(24)} ${efeito.fadeMs ? "cortado" : "       "}  ataque local ${ataqueL.map((v) => v.toFixed(0).padStart(4)).join("")} | nuvem ${ataqueN.map((v) => v.toFixed(0).padStart(4)).join("")}  inteiro ${media(inteiroL).toFixed(1)} x ${media(inteiroN).toFixed(1)}${marca}`,
  );
}
console.log(`\n${diferentes} de ${props.efeitos?.length ?? 0} efeitos diferentes (ataque > 3 dB ou som inteiro > 1 dB).`);
