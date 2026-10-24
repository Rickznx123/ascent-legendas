// Teste de viabilidade: legendas ATRÁS da pessoa. Fora do app, do motor e da produção:
// só lê os utilitários de ffmpeg de src/motor (sem alterá-los).
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import path from "node:path";

export const PASTA = import.meta.dirname;
export const ENTRADA = path.join(PASTA, "entrada");
export const SAIDA = path.join(PASTA, "saida");
export const RAIZ = path.resolve(PASTA, "..", "..");

// arielreplicate/robust_video_matting (Robust Video Matting), versão fixa de 2022-12-11.
export const MODELO = "arielreplicate/robust_video_matting";
export const VERSAO = "73d2128a371922d5d1abf0712a1d974be0e4e2358cc1218e4e34714767232bac";
// Roda numa Nvidia L40S: US$ 0,000975 por segundo de processamento (replicate.com/pricing,
// 23/10/2026). Modelo público: só o processamento é cobrado (metrics.predict_time).
export const PRECO_POR_SEGUNDO = 0.000975;

// Vídeo de base: H.264, 30 fps constantes, lado menor até 1080 px (o mesmo arquivo vai
// ao modelo, à mescla da máscara e à composição, para os quadros baterem).
export const base = (nome: string) => path.join(SAIDA, `${path.parse(nome).name}.base.mp4`);
export const mascara = (nome: string) => path.join(SAIDA, `${path.parse(nome).name}.mascara.mp4`);
export const recorte = (nome: string) => path.join(SAIDA, `${path.parse(nome).name}.recorte.webm`);

export const videosDaEntrada = (): string[] =>
  existsSync(ENTRADA) ? readdirSync(ENTRADA).filter((nome) => /\.(mp4|mov|m4v|mkv|webm)$/iu.test(nome)).sort() : [];

// Medições de cada vídeo, juntadas em saida/medicoes.json (para o relatório).
const ARQUIVO = path.join(SAIDA, "medicoes.json");
export const lerMedicoes = (): Record<string, Record<string, unknown>> =>
  existsSync(ARQUIVO) ? (JSON.parse(readFileSync(ARQUIVO, "utf8")) as Record<string, Record<string, unknown>>) : {};
export const gravarMedicao = (nome: string, dados: Record<string, unknown>) => {
  mkdirSync(SAIDA, {recursive: true});
  const todas = lerMedicoes();
  todas[nome] = {...todas[nome], ...dados};
  writeFileSync(ARQUIVO, JSON.stringify(todas, null, 2));
};

export const segundosDesde = (inicio: number) => Number(((Date.now() - inicio) / 1000).toFixed(1));
