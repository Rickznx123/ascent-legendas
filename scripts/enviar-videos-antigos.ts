// npx tsx scripts/enviar-videos-antigos.ts <id da conta>
// Envia para o S3 (videos/<conta>/<nome>) os vídeos da conta que só existem no disco
// deste computador (usuarios/<conta>/), enviados antes do S3. Depois disso, o app
// publicado (que não tem o disco) lista esses vídeos, e os projetos deles, que já
// estão no Supabase, abrem lá. A prévia leve e a capa são feitas na primeira vez que
// o vídeo é aberto no app. O arquivo no disco fica onde está. Pode rodar de novo:
// o que já está no S3 é pulado.
import {createReadStream, existsSync, statSync} from "node:fs";
import path from "node:path";
import {PutObjectCommand} from "@aws-sdk/client-s3";
import {carregarEnv} from "../src/motor/env";
import {listarVideos} from "../src/motor/projeto";
import {PASTAS_NO_BUCKET, configuracaoDoAmbiente} from "../app/servidor/configuracao";
import {s3DoAmbiente} from "../app/servidor/s3";
import {tituloDoVideo} from "../app/servidor/titulo";

const RAIZ = path.resolve(import.meta.dirname, "..");
carregarEnv(RAIZ);

const conta = process.argv[2];
if (!conta || !/^[0-9a-f-]{36}$/iu.test(conta)) {
  throw new Error("Uso: npx tsx scripts/enviar-videos-antigos.ts <id da conta (uuid)>");
}
const pasta = path.join(RAIZ, "usuarios", conta);
if (!existsSync(pasta)) {
  throw new Error(`Não há pasta de vídeos desta conta neste computador: ${pasta}`);
}
const armazenamento = s3DoAmbiente(configuracaoDoAmbiente());
if (!armazenamento) {
  throw new Error("Faltam as chaves da AWS no .env.");
}

const tipoDoVideo = (nome: string): string => {
  const extensao = path.extname(nome).toLowerCase();
  return extensao === ".mov" ? "video/quicktime" : extensao === ".webm" ? "video/webm" : extensao === ".mkv" ? "video/x-matroska" : "video/mp4";
};

for (const nome of listarVideos(pasta)) {
  const chave = `${PASTAS_NO_BUCKET.videos.prefixo}${conta}/${nome}`;
  if (await armazenamento.existe(chave)) {
    console.log(`${nome}: já está no S3`);
    continue;
  }
  const arquivo = path.join(pasta, nome);
  const {size, mtime} = statSync(arquivo);
  const inicio = Date.now();
  await armazenamento.s3.send(
    new PutObjectCommand({
      Bucket: armazenamento.bucket,
      Key: chave,
      Body: createReadStream(arquivo),
      ContentLength: size,
      ContentType: tipoDoVideo(nome),
      // Os mesmos metadados do envio pelo app (veja app/servidor/envio.ts).
      Metadata: {"nome-original": encodeURIComponent(nome), titulo: encodeURIComponent(tituloDoVideo(nome, mtime))},
    }),
  );
  console.log(`${nome}: enviado (${(size / 1048576).toFixed(1)} MB em ${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
}
