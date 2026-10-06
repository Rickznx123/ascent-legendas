// Site do Remotion no Lambda (o bundle da composição), com o nome da versão do
// código: "legendas-<hash>", o hash do que vai no bundle (src/, fontes/, sons/ e a
// versão do Remotion). Mudou o código da legenda, muda o nome; um site com o nome
// da versão atual já tem o código certo. Templates e paletas não entram no bundle:
// viajam nas props.
import {createHash} from "node:crypto";
import {cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {deploySite, getOrCreateBucket, getSites} from "@remotion/lambda";
import type {AwsRegion} from "@remotion/lambda";

const PASTAS_DO_BUNDLE = ["src", "fontes", "sons"];
const TEXTO = /\.(ts|tsx|js|json|css|md|txt)$/iu;

const arquivosDe = (pasta: string): string[] =>
  existsSync(pasta)
    ? readdirSync(pasta)
        .sort()
        .flatMap((nome) => {
          const caminho = path.join(pasta, nome);
          return statSync(caminho).isDirectory() ? arquivosDe(caminho) : [caminho];
        })
    : [];

export const versaoDoCodigo = (raiz: string): string => {
  const hash = createHash("sha256");
  for (const pasta of PASTAS_DO_BUNDLE) {
    for (const arquivo of arquivosDe(path.join(raiz, pasta))) {
      hash.update(path.relative(raiz, arquivo).replaceAll("\\", "/"));
      // Texto com a quebra de linha do Linux: o git no Windows pode trocar por CRLF,
      // e o mesmo código daria outro nome aqui e no Render.
      const conteudo = readFileSync(arquivo);
      hash.update(TEXTO.test(arquivo) ? conteudo.toString("utf8").replaceAll("\r\n", "\n") : conteudo);
    }
  }
  const remotion = JSON.parse(readFileSync(path.join(raiz, "node_modules", "remotion", "package.json"), "utf8")) as {version: string};
  hash.update(remotion.version);
  return hash.digest("hex").slice(0, 12);
};

export const nomeDoSite = (raiz: string): string => `legendas-${versaoDoCodigo(raiz)}`;

export type SiteDoLambda = {nome: string; serveUrl: string; bucketDoRemotion: string};

// O site da versão atual, se já foi publicado.
export const siteDaVersao = async (raiz: string, regiao: AwsRegion): Promise<SiteDoLambda | undefined> => {
  const nome = nomeDoSite(raiz);
  const {sites} = await getSites({region: regiao});
  const site = sites.find((s) => s.id === nome);
  return site ? {nome, serveUrl: site.serveUrl, bucketDoRemotion: site.bucketName} : undefined;
};

// Publica o site da versão atual (a pasta sons/ vai como pasta pública).
export const publicarSite = async (raiz: string, regiao: AwsRegion): Promise<SiteDoLambda> => {
  const nome = nomeDoSite(raiz);
  const {bucketName} = await getOrCreateBucket({region: regiao});
  const publica = mkdtempSync(path.join(os.tmpdir(), "legendas-site-"));
  try {
    cpSync(path.join(raiz, "sons"), path.join(publica, "sons"), {recursive: true});
    const {serveUrl} = await deploySite({
      region: regiao,
      bucketName,
      entryPoint: path.join(raiz, "src", "index.tsx"),
      siteName: nome,
      options: {publicDir: publica},
    });
    return {nome, serveUrl, bucketDoRemotion: bucketName};
  } finally {
    rmSync(publica, {recursive: true, force: true});
  }
};
