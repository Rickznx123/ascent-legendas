// npx.cmd tsx testes/recorte/renderizar.ts [--atras PALAVRA] [--frente PALAVRA]
// Depois do recortar.ts --rodar: para cada vídeo com recorte, renderiza neste computador
// (nada vai para a nuvem) a composição sem e com a pessoa recortada, mede o tempo extra
// e tira quadros (sobre o vídeo e sobre magenta) para conferir a borda: cabelo, mãos.
import {existsSync, mkdirSync} from "node:fs";
import path from "node:path";
import {bundle} from "@remotion/bundler";
import {renderMedia, renderStill, selectComposition} from "@remotion/renderer";
import {getVideoMetadata} from "../../src/motor/ferramentas";
import {PASTA, SAIDA, base, gravarMedicao, recorte, segundosDesde, videosDaEntrada} from "./comum";
import type {Props} from "./composicao";

const opcao = (nome: string, padrao: string) => {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : padrao;
};
const atras = opcao("--atras", "ATRÁS");
const frente = opcao("--frente", "FRENTE");
const QUADROS = [0.2, 0.5, 0.8];

const prontos = videosDaEntrada().filter((nome) => existsSync(recorte(nome)));
if (prontos.length === 0) {
  console.log("Nenhum recorte pronto em saida/. Rode antes: npx.cmd tsx testes/recorte/recortar.ts --rodar");
  process.exit(0);
}
const pastaDosRenders = path.join(SAIDA, "render");
const pastaDosQuadros = path.join(SAIDA, "quadros");
mkdirSync(pastaDosRenders, {recursive: true});
mkdirSync(pastaDosQuadros, {recursive: true});

// saida/ é a pasta pública do bundle (staticFile lê dela).
const serveUrl = await bundle({entryPoint: path.join(PASTA, "composicao", "index.tsx"), publicDir: SAIDA});

for (const nome of prontos) {
  const info = await getVideoMetadata(base(nome));
  const props: Props = {base: path.basename(base(nome)), atras, frente, ...info};
  const comRecorte: Props = {...props, recorte: path.basename(recorte(nome))};
  const tempos: Record<string, number> = {};
  for (const [rotulo, inputProps] of Object.entries({sem: props, com: comRecorte})) {
    const composition = await selectComposition({serveUrl, id: "Recorte", inputProps});
    const inicio = Date.now();
    await renderMedia({composition, serveUrl, inputProps, codec: "h264", outputLocation: path.join(pastaDosRenders, `${path.parse(nome).name}.${rotulo}.mp4`)});
    tempos[rotulo] = segundosDesde(inicio);
    console.log(`${nome} ${rotulo} recorte: ${tempos[rotulo]} s`);
  }
  const composition = await selectComposition({serveUrl, id: "Recorte", inputProps: comRecorte});
  for (const fracao of QUADROS) {
    const frame = Math.floor(info.durationInFrames * fracao);
    for (const [rotulo, inputProps] of Object.entries({video: comRecorte, magenta: {...comRecorte, fundo: "#ff00ff"}})) {
      await renderStill({composition, serveUrl, inputProps, frame, output: path.join(pastaDosQuadros, `${path.parse(nome).name}-${Math.round(fracao * 100)}-${rotulo}.png`)});
    }
  }
  const duracaoS = info.durationInFrames / info.fps;
  gravarMedicao(nome, {renderSemS: tempos.sem, renderComS: tempos.com, renderExtraPorMinutoS: Number((((tempos.com - tempos.sem) / duracaoS) * 60).toFixed(1))});
}
console.log(`Renders em ${pastaDosRenders}, quadros em ${pastaDosQuadros}, medições em saida/medicoes.json.`);
