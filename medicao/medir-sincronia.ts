// npm run medir-sincronia -- [--video arquivo.mp4] [--groq transcricao-groq.json] [--refazer-local]
//
// Mede a sincronia das transcrições com o áudio: onde a voz começa depois de um
// silêncio e onde para antes de um, comparado com o início e o fim das palavras.
// Compara o Whisper local (o do app) e a Groq, mede quanto o próprio motor desloca
// as palavras e gera uma página de conferência. Não altera o projeto: os
// resultados ficam em medicao/resultados/.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {getVideoMetadata} from "../src/motor/ferramentas";
import {WHISPER_MODEL} from "../src/motor/projeto";
import {transcribeVideo} from "../src/motor/transcrever";
import type {Word} from "../src/types";
import {ERRO_VISIVEL_MS, UM_QUADRO_MS, compararComAudio, estatisticas, piores} from "./comparacao";
import type {Estatisticas, Ponto} from "./comparacao";
import {encaixarNoAudio} from "../src/encaixe";
import type {VozDoAudio} from "../src/types";
import {analisarMotor, compararTrocas, sincroniaPadraoMs} from "./motor";
import type {TrocaDoBloco} from "./motor";
import {montarPagina} from "./pagina";
import type {TranscricaoNaPagina} from "./pagina";
import {JANELA_MS, TAXA, VOZ_CONFIG, detectarVoz, energiaPorJanela, extrairAudio, wav} from "./voz";

const RAIZ = path.resolve(import.meta.dirname, "..");
const SAIDA = path.join(RAIZ, "medicao", "resultados");
// Vídeo de teste (o da comparação Whisper local × Groq).
const VIDEO_DE_TESTE = "Maiara - Harmonização intima.mp4";

const argumento = (nome: string): string | undefined => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const acharVideo = (): string => {
  const pedido = argumento("--video");
  const candidatos = pedido
    ? [path.resolve(pedido)]
    : [path.join(RAIZ, VIDEO_DE_TESTE), path.join(RAIZ, "removidos", VIDEO_DE_TESTE)];
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) {
    throw new Error(`Vídeo não encontrado: ${candidatos.join(" ou ")}. Use --video caminho.mp4.`);
  }
  return achado;
};

type Transcricao = {nome: string; arquivo: string; palavras: Word[]};

const lerPalavras = (arquivo: string): {source?: string; words: Word[]} => JSON.parse(readFileSync(arquivo, "utf8"));

const whisperLocal = async (video: string, base: string): Promise<Transcricao> => {
  const arquivo = path.join(SAIDA, `${base}.whisper-local.json`);
  if (!existsSync(arquivo) || process.argv.includes("--refazer-local")) {
    console.log(`Transcrevendo com o Whisper local (${WHISPER_MODEL})...`);
    const words = await transcribeVideo(RAIZ, video, (etapa, fracao) =>
      process.stdout.write(`\r  ${etapa}${fracao !== undefined ? ` ${Math.round(fracao * 100)}%` : ""}        `),
    );
    process.stdout.write("\n");
    writeFileSync(arquivo, JSON.stringify({source: path.basename(video), model: WHISPER_MODEL, words}, null, 2));
  }
  return {nome: `Whisper local (${WHISPER_MODEL})`, arquivo, palavras: lerPalavras(arquivo).words};
};

const groq = async (video: string, base: string): Promise<Transcricao | undefined> => {
  const pedido = argumento("--groq");
  const existentes = [pedido, path.join(RAIZ, "nuvem", "resultados", "transcricao-groq.json"), path.join(SAIDA, `${base}.groq.json`)].filter(
    (c): c is string => Boolean(c) && existsSync(c!),
  );
  const doVideo = existentes.find((c) => (lerPalavras(c).source ?? path.basename(video)) === path.basename(video));
  if (doVideo) {
    return {nome: "Groq (whisper-large-v3)", arquivo: doVideo, palavras: lerPalavras(doVideo).words};
  }
  if (!process.env.GROQ_API_KEY && !existsSync(path.join(RAIZ, ".env"))) {
    console.log("Sem transcrição da Groq para este vídeo nem chave GROQ_API_KEY: só o Whisper local será medido.");
    return undefined;
  }
  console.log("Transcrevendo com a Groq...");
  const {transcreverGroq} = await import("../nuvem/transcrever-groq");
  const {words} = await transcreverGroq(video);
  const arquivo = path.join(SAIDA, `${base}.groq.json`);
  writeFileSync(arquivo, JSON.stringify({source: path.basename(video), model: "groq/whisper-large-v3", words}, null, 2));
  return {nome: "Groq (whisper-large-v3)", arquivo, palavras: words};
};

const ms = (v: number) => `${Math.round(v)} ms`;
const s = (v: number) => `${(v / 1000).toFixed(2)} s`;

const relatorioDaTranscricao = (nome: string, est: Estatisticas, porTipo: Record<string, Estatisticas>, ruins: Ponto[]) => {
  console.log(`\n=== ${nome} ===`);
  const linha = (rotulo: string, e: Estatisticas) =>
    console.log(
      `  ${rotulo.padEnd(8)} ${String(e.pontos).padStart(3)} pontos · médio ${ms(e.erroMedioMs).padStart(6)} · mediana ${ms(e.medianaMs).padStart(6)} · pior ${ms(e.piorMs).padStart(6)} · >${UM_QUADRO_MS} ms: ${String(e.acimaDeUmQuadro).padStart(3)} · >${ERRO_VISIVEL_MS} ms: ${String(e.acimaDe80Ms).padStart(3)} · viés ${e.viesMs > 0 ? "+" : ""}${e.viesMs} ms`,
    );
  linha("total", est);
  for (const [tipo, e] of Object.entries(porTipo)) linha(tipo, e);
  console.log(
    `  Sem o viés (se só a sincronia global corrigisse): médio ${ms(est.semVies.erroMedioMs)} · >${UM_QUADRO_MS} ms: ${est.semVies.acimaDeUmQuadro} · >${ERRO_VISIVEL_MS} ms: ${est.semVies.acimaDe80Ms}`,
  );
  console.log(`  As ${ruins.length} piores:`);
  for (const p of ruins) {
    console.log(
      `    ${p.palavra.padEnd(16)} ${p.tipo.padEnd(6)} transcrição ${s(p.transcricaoMs)} · áudio ${s(p.audioMs)} · erro ${p.erroMs > 0 ? "+" : ""}${Math.round(p.erroMs)} ms`,
    );
  }
};

const relatorioCurto = (rotulo: string, porTipo: Record<string, Estatisticas>) => {
  for (const [tipo, e] of Object.entries(porTipo)) {
    console.log(
      `    ${rotulo.padEnd(7)} ${tipo.padEnd(7)} médio ${ms(e.erroMedioMs).padStart(6)} · mediana ${ms(e.medianaMs).padStart(6)} · pior ${ms(e.piorMs).padStart(6)} · >${UM_QUADRO_MS} ms: ${String(e.acimaDeUmQuadro).padStart(3)} de ${e.pontos} · >${ERRO_VISIVEL_MS} ms: ${String(e.acimaDe80Ms).padStart(3)}`,
    );
  }
};

const principal = async () => {
  mkdirSync(SAIDA, {recursive: true});
  const video = acharVideo();
  const base = path.basename(video, path.extname(video));
  const {fps, durationInFrames} = await getVideoMetadata(video);
  console.log(`Vídeo: ${video} (${fps} fps, ${durationInFrames} quadros)`);

  const transcricoes = [await whisperLocal(video, base), await groq(video, base)].filter((t): t is Transcricao => Boolean(t));

  console.log("Analisando o áudio...");
  const audio = await extrairAudio(video);
  const energia = energiaPorJanela(audio);
  const voz = detectarVoz(energia);
  const duracaoMs = (audio.length / TAXA) * 1000;
  console.log(
    `  ${voz.trechos.length} trechos de voz · ${voz.comecos.length} começos depois de silêncio de ${VOZ_CONFIG.silencioMinimoMs} ms+ · ${voz.fins.length} fins antes de silêncio · piso ${voz.pisoDb.toFixed(1)} dB, pico ${voz.picoDb.toFixed(1)} dB`,
  );

  const naPagina: TranscricaoNaPagina[] = [];
  const resumo: Record<string, unknown> = {};
  // A voz no formato salvo no projeto (a mesma que a Sincronia precisa usa).
  const vozDoAudio: VozDoAudio = {trechos: voz.trechos.map((t) => [t.inicioMs, t.fimMs]), duracaoMs};
  for (const t of transcricoes) {
    const pontos = compararComAudio(t.palavras, voz.comecos, voz.fins);
    const est = estatisticas(pontos);
    const porTipo = {
      início: estatisticas(pontos.filter((p) => p.tipo === "início")),
      fim: estatisticas(pontos.filter((p) => p.tipo === "fim")),
    };
    const ruins = piores(pontos, 15);
    relatorioDaTranscricao(t.nome, est, porTipo, ruins);
    naPagina.push({nome: t.nome, palavras: t.palavras, pontos, estatisticas: est, piores: ruins});
    // Com o encaixe da Sincronia precisa (src/encaixe.ts). Atenção: a detecção de
    // voz é a mesma da medição, então um ponto encaixado mede zero por construção; o
    // que interessa é quantos pontos encaixaram e o erro dos que ficaram de fora.
    const encaixe = encaixarNoAudio(t.palavras, vozDoAudio);
    const pontosDepois = compararComAudio(encaixe.palavras, voz.comecos, voz.fins);
    const depois = {
      total: estatisticas(pontosDepois),
      início: estatisticas(pontosDepois.filter((p) => p.tipo === "início")),
      fim: estatisticas(pontosDepois.filter((p) => p.tipo === "fim")),
    };
    console.log(
      `  Com o encaixe (Sincronia precisa): ${encaixe.inicios} inícios e ${encaixe.fins} fins encaixados, ${encaixe.trechosDuvidosos} trechos duvidosos não encaixados`,
    );
    relatorioCurto("antes", porTipo);
    relatorioCurto("depois", {início: depois.início, fim: depois.fim});
    const restantes = piores(pontosDepois, 8).filter((p) => Math.abs(p.erroMs) > UM_QUADRO_MS);
    for (const p of restantes) {
      console.log(`    sobrou: ${p.palavra.padEnd(16)} ${p.tipo.padEnd(6)} erro ${p.erroMs > 0 ? "+" : ""}${Math.round(p.erroMs)} ms`);
    }
    resumo[t.nome] = {arquivo: path.relative(RAIZ, t.arquivo), total: est, ...porTipo, piores: ruins, comEncaixe: {...depois, inicios: encaixe.inicios, fins: encaixe.fins, trechosDuvidosos: encaixe.trechosDuvidosos}};
  }

  console.log("\n=== O motor (mesmas palavras do Whisper local, agrupadas como numa transcrição nova) ===");
  // Os dois modos medidos com a mesma régua: o instante falado das palavras
  // encaixadas no áudio (onde não encaixam, o da transcrição).
  const palavrasDoMotor = transcricoes[0].palavras;
  const motor = await analisarMotor(RAIZ, palavrasDoMotor, fps, {voz: vozDoAudio});
  const motorPreciso = await analisarMotor(RAIZ, palavrasDoMotor, fps, {voz: vozDoAudio, precisa: {voz: vozDoAudio, fps}});
  console.log(`  Quadro: ${(1000 / fps).toFixed(1)} ms · sincronia global padrão: ${sincroniaPadraoMs} ms (cada projeto pode ter a sua)`);
  for (const [modo, m] of [["desligada", motor], ["ligada", motorPreciso]] as const) {
  console.log(`  Animações de entrada, Sincronia precisa ${modo} (tempos relativos à fala; negativo = antes):`);
  for (const a of m.animacoes) {
    console.log(
      `    ${a.nome.padEnd(18)} ${String(a.duracaoMs).padStart(4)} ms · começa ${a.comecaAntesMs} ms antes · 70% visível de ${a.setentaPorCentoMs[0]} a ${a.setentaPorCentoMs[1]} ms · inteira em ${a.terminaMs > 0 ? "+" : ""}${a.terminaMs} ms · na fala ${Math.round(a.naFala[0] * 100)}–${Math.round(a.naFala[1] * 100)}%, depois nunca abaixo de ${Math.round(a.menorDepoisDaFala * 100)}%${a.apagaDepoisMs.length ? ` · APAGA (abaixo de 70%) em ${a.apagaDepoisMs.map(([de, ate]) => `${de > 0 ? "+" : ""}${de}…${ate > 0 ? "+" : ""}${ate} ms`).join(", ")}` : ""}`,
    );
  }
  }
  for (const [modo, m] of [["desligada", motor], ["ligada", motorPreciso]] as const) {
  console.log(`  Linha do tempo, Sincronia precisa ${modo} (um bloco por vez):`);
  for (const l of m.linhaDoTempo) {
    console.log(
      `    pacote ${l.pacote.padEnd(5)} ${String(l.blocos).padStart(3)} blocos · atrasados ${l.blocosAtrasados} (máx ${l.atrasoMaximoMs} ms, ${l.palavrasAtrasadas} palavras não visíveis na fala) · saem antes do fim da última palavra: ${l.saiAntesDoFim} (mediana ${l.saiAntesMedianaMs} ms, máx ${l.saiAntesMaximoMs} ms) · última palavra na tela: mediana ${l.ultimaNaTelaMedianaMs} ms, menor ${l.ultimaNaTelaMenorMs} ms, ${l.ultimaNaTelaMenosDe200} com menos de 200 ms${l.invisiveis.length ? `
        abaixo de 70% na fala: ${l.invisiveis.join(" · ")}` : ""}`,
    );
  }
  }

  // Trocas de bloco em que a última palavra fica menos de 200 ms na tela, sai antes
  // do fim, ou a primeira do seguinte não está visível na fala, nos dois modos.
  // Colisão: última palavra com menos de 200 ms emendada na seguinte (menos de 2
  // quadros entre as duas), sem silêncio.
  const pct = (v?: number) => (v === undefined ? "—" : `${Math.round(v * 100)}%`);
  const sinal = (v?: number) => (v === undefined ? "—" : `${v > 0 ? "+" : ""}${v} ms`);
  const ruim = (t: TrocaDoBloco) =>
    t.saiDepoisMs < Math.min(200, t.ultimaDuracaoMs) || (t.seguinteVisivelNaFala ?? 1) < 0.7 || (t.seguinteEntraMs !== undefined && t.saiAntesDoFimMs > 0 && t.ultimaDuracaoMs < 200);
  const colisao = (t: TrocaDoBloco) =>
    t.ultimaDuracaoMs < 200 && t.silencioAteSeguinteMs !== undefined && t.silencioAteSeguinteMs < 2000 / 30;
  const trocasPorPacote: Record<string, unknown> = {};
  for (const pacote of ["a", "d", "e"]) {
    const trocas = await compararTrocas(RAIZ, palavrasDoMotor, fps, vozDoAudio, pacote);
    trocasPorPacote[pacote] = trocas;
    const casos = trocas.desligada.map((_, i) => i).filter((i) => ruim(trocas.desligada[i]) || ruim(trocas.ligada[i]));
    console.log(`\n  Trocas de bloco do pacote ${pacote.toUpperCase()} (${casos.length} casos). "fica": quanto a última palavra fica na tela depois de começar a ser falada; "antes do fim": quanto ela sai antes de terminar; "seguinte": quando o bloco seguinte entra em relação à primeira palavra dele e quanto ela está visível no quadro da fala.`);
    for (const i of casos) {
      const [d, l] = [trocas.desligada[i], trocas.ligada[i]];
      console.log(`    "${d.texto}" → última "${d.ultima}" (${d.ultimaDuracaoMs} ms falada, silêncio até o seguinte ${sinal(d.silencioAteSeguinteMs)})${colisao(l) ? " · COLISÃO" : ""}`);
      for (const [modo, t] of [["desligada", d], ["ligada   ", l]] as const) {
        console.log(`      ${modo}: fica ${sinal(t.saiDepoisMs)}, antes do fim ${sinal(Math.max(0, t.saiAntesDoFimMs))} · seguinte entra ${sinal(t.seguinteEntraMs)}, ${pct(t.seguinteVisivelNaFala)} visível na fala`);
      }
    }
    // Resumo do modo ligado: colisões, primeiras palavras abaixo de 100% e últimas
    // curtas que saem antes do fim.
    const comSeguinte = trocas.ligada.filter((t) => t.seguinteEntraMs !== undefined);
    const colisoes = comSeguinte.filter(colisao);
    console.log(
      `    resumo ligada: ${comSeguinte.length} trocas · ${colisoes.length} colisões, primeira do seguinte abaixo de 100% na fala em ${colisoes.filter((t) => (t.seguinteVisivelNaFala ?? 1) < 0.999).length}, última saindo antes do fim em ${colisoes.filter((t) => t.saiAntesDoFimMs > 0).length} (máx ${Math.max(0, ...colisoes.map((t) => t.saiAntesDoFimMs))} ms) · fora das colisões: primeira abaixo de 70% em ${comSeguinte.filter((t) => !colisao(t) && (t.seguinteVisivelNaFala ?? 1) < 0.7).length}, última curta saindo antes do fim em ${comSeguinte.filter((t) => !colisao(t) && t.ultimaDuracaoMs < 200 && t.saiAntesDoFimMs > 0).length}`,
    );
  }
  // Sincronia salva nos projetos (anda todas as legendas).
  for (const arquivo of [path.join(RAIZ, "transcricao.json")]) {
    if (existsSync(arquivo)) {
      const projeto = JSON.parse(readFileSync(arquivo, "utf8")) as {source?: string; sincroniaMs?: number};
      console.log(`  Sincronia salva em transcricao.json (${projeto.source}): ${projeto.sincroniaMs ?? sincroniaPadraoMs} ms`);
    }
  }
  const exemplos = motor.linhaDoTempo.find((l) => l.exemplosSaiAntes.length)?.exemplosSaiAntes ?? [];
  for (const e of exemplos) console.log(`      ex.: ${e}`);

  const picos: number[] = [];
  const amostrasPorJanela = (TAXA * JANELA_MS) / 1000;
  let maximo = 1e-6;
  for (let j = 0; j < energia.length; j++) {
    let p = 0;
    for (let i = j * amostrasPorJanela; i < (j + 1) * amostrasPorJanela; i++) p = Math.max(p, Math.abs(audio[i]));
    picos.push(p);
    maximo = Math.max(maximo, p);
  }
  const pagina = montarPagina({
    video: path.basename(video),
    duracaoMs,
    energiaDb: energia,
    picos: picos.map((p) => p / maximo),
    voz,
    transcricoes: naPagina,
    wavBase64: wav(audio).toString("base64"),
  });
  const arquivoPagina = path.join(SAIDA, `${base}.sincronia.html`);
  const arquivoJson = path.join(SAIDA, `${base}.sincronia.json`);
  writeFileSync(arquivoPagina, pagina);
  writeFileSync(arquivoJson, JSON.stringify({video: path.basename(video), fps, voz: {...voz, trechos: voz.trechos.length}, transcricoes: resumo, motor, motorPreciso, trocas: trocasPorPacote}, null, 2));
  console.log(`\nPágina de conferência: ${arquivoPagina}`);
  console.log(`Números: ${arquivoJson}`);
};

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.stack : erro);
  process.exitCode = 1;
});
