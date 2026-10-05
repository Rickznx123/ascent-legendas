// npx tsx nuvem/render-local.ts [--pacote misto]
// Render de referência no computador, com as mesmas props do render na nuvem
// (nuvem/props.ts) e o mesmo renderVideo do app. Saída em nuvem/resultados/.
import path from "node:path";
import {renderVideo} from "../src/motor/exportar";
import {readProject} from "../src/motor/projeto";
import {RAIZ} from "./env";
import {montarProps} from "./props";

const valor = (opcao: string) => {
  const indice = process.argv.indexOf(opcao);
  return indice > 0 ? process.argv[indice + 1] : undefined;
};

const pacote = valor("--pacote") ?? "misto";
const inputPath = path.join(RAIZ, readProject(RAIZ)?.source ?? "");
const props = await montarProps(inputPath, {pacote});
const outputPath = path.join(RAIZ, "nuvem", "resultados", `local-${pacote}.mp4`);

const inicio = Date.now();
let etapa = "";
await renderVideo({root: RAIZ, inputPath, outputPath, ...props}, (atual) => {
  if (atual !== etapa) {
    console.log(atual);
    etapa = atual;
  }
});
console.log(`Render local: ${outputPath} em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
