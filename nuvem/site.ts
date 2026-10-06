// npm run nuvem:site
// Publica o site do Remotion no Lambda com o nome da versão do código
// (legendas-<hash>, veja app/servidor/site-lambda.ts). Rode depois de mudar src/,
// fontes/ ou sons/ e antes de publicar o app: sem o site da versão, a exportação
// avisa e não começa. Já publicado, não faz nada. Montar o site passa de 512 MB de
// memória (medido: ~780 MB), então não roda no servidor da nuvem.
import {REGIAO, RAIZ, exigir} from "./env";
import {nomeDoSite, publicarSite, siteDaVersao} from "../app/servidor/site-lambda";

exigir("REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY");

const existente = await siteDaVersao(RAIZ, REGIAO);
if (existente) {
  console.log(`Site ${existente.nome} já publicado: ${existente.serveUrl}`);
} else {
  console.log(`Publicando ${nomeDoSite(RAIZ)}...`);
  const inicio = Date.now();
  const site = await publicarSite(RAIZ, REGIAO);
  console.log(`Site ${site.nome} publicado em ${((Date.now() - inicio) / 1000).toFixed(1)} s: ${site.serveUrl}`);
}
