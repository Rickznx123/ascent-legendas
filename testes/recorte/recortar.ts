// npx.cmd tsx testes/recorte/recortar.ts           só prepara os vídeos e mostra o custo estimado
// npx.cmd tsx testes/recorte/recortar.ts --rodar   envia ao Replicate e salva a pessoa recortada
// Para cada vídeo de entrada/: gera a base (H.264 30 fps), pede ao Robust Video Matting a
// máscara (alpha-mask, preto e branco), junta a máscara com a base no ffmpeg e salva
// saida/<nome>.recorte.webm (VP9 com alfa, que o OffthreadVideo transparent aceita).
import {mkdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import path from "node:path";
import {carregarEnv} from "../../src/motor/env";
import {execFileAsync, ffmpegPath, getVideoMetadata} from "../../src/motor/ferramentas";
import {ENTRADA, MODELO, PRECO_POR_SEGUNDO, RAIZ, SAIDA, VERSAO, base, gravarMedicao, mascara, recorte, segundosDesde, videosDaEntrada} from "./comum";

carregarEnv(RAIZ);
const rodar = process.argv.includes("--rodar");
// Estimativa: o processamento leva de 0,5 a 2 vezes a duração do vídeo (RVM passa de 100
// quadros/s em HD numa GPU; o resto é ler e gravar o vídeo). A medição de verdade fica em
// medicoes.json.
const FATOR = {min: 0.5, provavel: 1, max: 2};
// Trava: passou deste tempo de processamento, a previsão é cancelada (não gasta mais).
const LIMITE_S = (duracaoS: number) => duracaoS * 4 + 120;
// O Replicate aceita arquivos de até 100 MB pelo envio direto.
const MAXIMO_BYTES = 100 * 1024 * 1024;

type Previsao = {id: string; status: string; error?: string; output?: string; metrics?: {predict_time?: number}};

const token = process.env.REPLICATE_API_TOKEN?.trim();
const replicate = async <T>(caminho: string, init: RequestInit = {}): Promise<T> => {
  const resposta = await fetch(`https://api.replicate.com/v1${caminho}`, {...init, headers: {Authorization: `Bearer ${token}`, ...(init.headers ?? {})}});
  if (!resposta.ok) throw new Error(`Replicate respondeu ${resposta.status} em ${caminho}: ${(await resposta.text()).slice(0, 300)}`);
  return (await resposta.json()) as T;
};

const prepararBase = async (nome: string) => {
  // Lado menor em 1080 (sem aumentar vídeo menor), dimensões pares, 30 fps constantes.
  const escala = "scale='if(gt(iw,ih),-2,trunc(min(1080,iw)/2)*2)':'if(gt(iw,ih),trunc(min(1080,ih)/2)*2,-2)'";
  await execFileAsync(ffmpegPath(), ["-v", "error", "-y", "-i", path.join(ENTRADA, nome), "-vf", `${escala},fps=30,format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", base(nome)]);
  return getVideoMetadata(base(nome));
};

const recortarNoReplicate = async (nome: string, duracaoS: number) => {
  const arquivo = base(nome);
  if (statSync(arquivo).size > MAXIMO_BYTES) throw new Error(`${nome}: a base passou de 100 MB (use um trecho mais curto).`);
  const inicio = Date.now();
  const formulario = new FormData();
  formulario.append("content", new Blob([readFileSync(arquivo)], {type: "video/mp4"}), path.basename(arquivo));
  const enviado = await replicate<{urls: {get: string}}>("/files", {method: "POST", body: formulario});
  const envioS = segundosDesde(inicio);
  let previsao = await replicate<Previsao>("/predictions", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({version: VERSAO, input: {input_video: enviado.urls.get, output_type: "alpha-mask"}}),
  });
  const criadaEm = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(previsao.status)) {
    await new Promise((r) => setTimeout(r, 3000));
    previsao = await replicate<Previsao>(`/predictions/${previsao.id}`);
    if (segundosDesde(criadaEm) > LIMITE_S(duracaoS) + 300) {
      await replicate(`/predictions/${previsao.id}/cancel`, {method: "POST"});
      throw new Error(`${nome}: cancelado, passou de ${LIMITE_S(duracaoS)} s.`);
    }
  }
  if (previsao.status !== "succeeded" || !previsao.output) throw new Error(`${nome}: ${previsao.status} ${previsao.error ?? ""}`);
  const resposta = await fetch(previsao.output);
  writeFileSync(mascara(nome), Buffer.from(await resposta.arrayBuffer()));
  const processamentoS = previsao.metrics?.predict_time ?? 0;
  return {id: previsao.id, envioS, processamentoS: Number(processamentoS.toFixed(1)), totalReplicateS: segundosDesde(inicio), custoUsd: Number((processamentoS * PRECO_POR_SEGUNDO).toFixed(4))};
};

// A máscara (cinza) vira o canal alfa da base: VP9 com alfa (yuva420p).
const mesclar = async (nome: string, largura: number, altura: number) => {
  const inicio = Date.now();
  await execFileAsync(ffmpegPath(), [
    "-v", "error", "-y", "-i", base(nome), "-i", mascara(nome),
    "-filter_complex", `[1:v]fps=30,scale=${largura}:${altura},format=gray[a];[0:v][a]alphamerge,format=yuva420p[v]`,
    "-map", "[v]", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
    recorte(nome),
  ]);
  return segundosDesde(inicio);
};

mkdirSync(SAIDA, {recursive: true});
const videos = videosDaEntrada();
if (videos.length === 0) {
  console.log(`Nenhum vídeo em ${ENTRADA}. Coloque os vídeos lá e rode de novo.`);
  process.exit(0);
}
if (rodar && !token) throw new Error("Falta REPLICATE_API_TOKEN no .env.");

let totalS = 0;
for (const nome of videos) {
  const info = await prepararBase(nome);
  const duracaoS = info.durationInFrames / info.fps;
  totalS += duracaoS;
  const custo = (fator: number) => `US$ ${(duracaoS * fator * PRECO_POR_SEGUNDO).toFixed(3)}`;
  console.log(`${nome}: ${duracaoS.toFixed(1)} s, ${info.width}x${info.height} → estimativa ${custo(FATOR.provavel)} (de ${custo(FATOR.min)} a ${custo(FATOR.max)})`);
  gravarMedicao(nome, {duracaoS: Number(duracaoS.toFixed(2)), largura: info.width, altura: info.height, baseBytes: statSync(base(nome)).size});
  if (!rodar) continue;
  const replicateMedido = await recortarNoReplicate(nome, duracaoS);
  const mesclarS = await mesclar(nome, info.width, info.height);
  const recorteBytes = statSync(recorte(nome)).size;
  gravarMedicao(nome, {...replicateMedido, mesclarS, mascaraBytes: statSync(mascara(nome)).size, recorteBytes});
  console.log(`  pronto: processamento ${replicateMedido.processamentoS} s (US$ ${replicateMedido.custoUsd}), total ${replicateMedido.totalReplicateS} s, mescla ${mesclarS} s, ${(recorteBytes / 1024 / 1024).toFixed(1)} MB`);
}
const total = (fator: number) => (totalS * fator * PRECO_POR_SEGUNDO).toFixed(3);
console.log(`\nTotal: ${totalS.toFixed(1)} s de vídeo → estimativa US$ ${total(FATOR.provavel)} (de US$ ${total(FATOR.min)} a US$ ${total(FATOR.max)}).`);
if (!rodar) console.log("Nada foi enviado. Para rodar: npx.cmd tsx testes/recorte/recortar.ts --rodar");
