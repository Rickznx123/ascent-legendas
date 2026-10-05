import {existsSync, readdirSync, statSync} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {register} from "tsx/esm/api";
import type {NamespacedUnregister} from "tsx/esm/api";
import type {CaptionTemplate, PackageConfig, Palette} from "./types";

const PACKAGE_PREFIX = "pacote-";

// Arquivos .ts de uma pasta; os que começam com "_" guardam peças compartilhadas.
const listModules = (directory: string): string[] =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts") && !file.startsWith("_"))
        .map((file) => path.basename(file, ".ts"))
        .sort((left, right) => left.localeCompare(right))
    : [];

// Templates, regras e paletas são importados num "namespace" do tsx. Recarregar
// troca de namespace, e o Node relê toda a árvore de arquivos (inclusive _estilos.ts)
// sem reiniciar o processo.
let generation = 0;
let scope: NamespacedUnregister | undefined;

export const reloadModules = async (): Promise<void> => {
  const previous = scope;
  generation++;
  scope = undefined;
  await previous?.unregister();
};

const importDefault = async <T>(filePath: string): Promise<T> => {
  scope ??= register({namespace: `modelos-${generation}`});
  const module = (await scope.import(pathToFileURL(filePath).href, import.meta.url)) as {default?: T};
  if (!module.default) {
    throw new Error(`${path.basename(filePath)} precisa exportar uma configuração padrão (export default).`);
  }
  return module.default;
};

// Pacotes são as pastas templates/pacote-<nome>/.
export const listPackages = (templatesDirectory: string): string[] =>
  existsSync(templatesDirectory)
    ? readdirSync(templatesDirectory)
        .filter(
          (entry) =>
            entry.startsWith(PACKAGE_PREFIX) &&
            statSync(path.join(templatesDirectory, entry)).isDirectory(),
        )
        .map((entry) => entry.slice(PACKAGE_PREFIX.length))
        .sort((left, right) => left.localeCompare(right))
    : [];

export const loadPackage = async (
  templatesDirectory: string,
  packageName: string,
): Promise<Record<string, CaptionTemplate>> => {
  const directory = path.join(templatesDirectory, `${PACKAGE_PREFIX}${packageName}`);
  const names = listModules(directory);
  if (names.length === 0) {
    throw new Error(`O pacote '${packageName}' não tem templates .ts em ${directory}`);
  }

  const templates: Record<string, CaptionTemplate> = {};
  for (const name of names) {
    templates[name] = await importDefault<CaptionTemplate>(path.join(directory, `${name}.ts`));
  }
  return templates;
};

// Regras do pacote (templates/pacote-<nome>/_pacote.ts): qual layout em cada situação.
export const loadPackageConfig = async (
  templatesDirectory: string,
  packageName: string,
  templates: Record<string, CaptionTemplate>,
): Promise<PackageConfig> => {
  const filePath = path.join(templatesDirectory, `${PACKAGE_PREFIX}${packageName}`, "_pacote.ts");
  if (!existsSync(filePath)) {
    throw new Error(`O pacote '${packageName}' precisa do arquivo _pacote.ts com as regras de layout.`);
  }
  const config = await importDefault<PackageConfig>(filePath);
  const referenced = [
    config.linear,
    ...(config.dupla ? [config.dupla] : []),
    ...config.threeLines,
    ...config.highlight.flatMap((rule) => rule.templates),
  ];
  for (const name of referenced) {
    if (!templates[name]) {
      throw new Error(`_pacote.ts do pacote '${packageName}' usa o layout '${name}', que não existe na pasta.`);
    }
  }
  if (config.threeLines.length === 0 || config.highlight.length === 0) {
    throw new Error(`_pacote.ts do pacote '${packageName}' precisa de ao menos uma regra de destaque e um layout de três linhas.`);
  }
  return config;
};

// Paletas são os arquivos paletas/<nome>.ts.
export const listPalettes = (palettesDirectory: string): string[] => listModules(palettesDirectory);

export const loadPalette = async (palettesDirectory: string, paletteName: string): Promise<Palette> => {
  const palette = await importDefault<Palette>(path.join(palettesDirectory, `${paletteName}.ts`));
  const fill = palette.keywordFill;
  const fillIsValid =
    fill?.type === "solida"
      ? typeof fill.color === "string"
      : fill?.type === "degrade" && Number.isFinite(fill.angle) && fill.stops?.length >= 2;
  if (
    typeof palette.supportColor !== "string" ||
    !fillIsValid ||
    typeof palette.glow?.inner !== "string" ||
    typeof palette.glow?.outer !== "string" ||
    !Number.isFinite(palette.glow?.intensity) ||
    typeof palette.shadow?.color !== "string"
  ) {
    throw new Error(
      `A paleta '${paletteName}' está incompleta. Ela precisa de supportColor, keywordFill (solida ou degrade com ao menos 2 paradas), glow {inner, outer, intensity} e shadow {color}.`,
    );
  }
  return palette;
};
