import {existsSync, mkdirSync, readdirSync, statSync} from "node:fs";
import path from "node:path";
import {lerSomTocado, somTocado} from "../sons";
import type {ArquivoSom, SomTocado} from "../sons";
import type {EfeitoSonoro} from "../types";
import {execFileAsync, ffmpegPath, ffprobePath} from "./ferramentas";

// Efeitos sonoros: sons/<categoria>/<arquivo>.mp3 ou .wav (impacto, whoosh, clique, suave).
export const pastaDeSons = (root: string): string => path.join(root, "sons");

const EXTENSOES = /\.(mp3|wav)$/iu;

// Duração usada se o ffprobe não conseguir ler o arquivo.
const DURACAO_PADRAO_MS = 2000;

const duracaoMs = async (arquivo: string): Promise<number> => {
  try {
    const {stdout} = await execFileAsync(ffprobePath(), [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      arquivo,
    ]);
    const segundos = Number(stdout.trim());
    return Number.isFinite(segundos) && segundos > 0 ? Math.round(segundos * 1000) : DURACAO_PADRAO_MS;
  } catch {
    return DURACAO_PADRAO_MS;
  }
};

const listarArquivos = (pasta: string, relativo = ""): string[] =>
  readdirSync(path.join(pasta, relativo), {withFileTypes: true}).flatMap((entrada) => {
    const caminho = relativo ? `${relativo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) {
      return listarArquivos(pasta, caminho);
    }
    return EXTENSOES.test(entrada.name) ? [caminho] : [];
  });

// Todos os sons da pasta (vazia ou inexistente: lista vazia, sem erro).
export const listarSons = async (root: string): Promise<ArquivoSom[]> => {
  const pasta = pastaDeSons(root);
  if (!existsSync(pasta)) {
    return [];
  }
  const arquivos = listarArquivos(pasta).sort((a, b) => a.localeCompare(b));
  return Promise.all(
    arquivos.map(async (arquivo) => ({
      arquivo,
      categoria: arquivo.includes("/") ? arquivo.split("/")[0].toLowerCase() : "",
      duracaoMs: await duracaoMs(path.join(pasta, arquivo)),
    })),
  );
};

// Caminho no disco de um som da pasta, sem deixar sair de sons/.
export const caminhoDoSom = (root: string, arquivo: string): string | undefined => {
  const pasta = pastaDeSons(root);
  const caminho = path.resolve(pasta, arquivo);
  const relativo = path.relative(pasta, caminho);
  return !relativo.startsWith("..") && !path.isAbsolute(relativo) && EXTENSOES.test(caminho) && existsSync(caminho)
    ? caminho
    : undefined;
};

// Fade do som cortado, com a mesma expressão que o Remotion montava para o volume
// por quadro (assets/ffmpeg-volume-expression.js do @remotion/renderer): um valor
// por quadro, de meio quadro antes a meio quadro depois, avaliado por bloco de
// áudio. Antes, o fade era o volume de <Html5Audio> calculado a cada quadro; agora
// fica no arquivo e o volume é fixo, e o som sai igual.
const expressaoDoFade = ({quadros, fps, fadeMs}: SomTocado): string => {
  const quadrosDoFade = (fadeMs / 1000) * fps;
  // Um valor por quadro, mais o último repetido (como o Remotion faz).
  const porValor = new Map<number, number[]>();
  for (let quadro = 0; quadro <= quadros; quadro++) {
    const q = Math.min(quadro, quadros - 1);
    const valor = Number(Math.min(1, Math.max(0, (quadros - 1 - q) / quadrosDoFade)).toFixed(3));
    porValor.set(valor, [...(porValor.get(valor) ?? []), quadro]);
  }
  // O valor mais comum fica por último, no "senão".
  const grupos = [...porValor].sort((a, b) => a[1].length - b[1].length);
  const janelas = (quadrosDoValor: number[]) =>
    quadrosDoValor
      .reduce<number[][]>((seguidos, quadro) => {
        const ultimo = seguidos.at(-1);
        if (ultimo && ultimo.at(-1) === quadro - 1) {
          ultimo.push(quadro);
        } else {
          seguidos.push([quadro]);
        }
        return seguidos;
      }, [])
      .map((s) => `between(t,${((s[0] - 0.5) / fps).toFixed(4)},${((s.at(-1)! + 0.5) / fps).toFixed(4)})`)
      .join("+");
  return grupos
    .slice(0, -1)
    .reduceRight((senao, [valor, quadrosDoValor]) => `if(${janelas(quadrosDoValor)},${valor},${senao})`, String(grupos.at(-1)![0]));
};

// Taxa do áudio do render (a padrão do Remotion).
const TAXA = 48000;

// Gera em destino o som tocado com esse nome (veja somTocado em src/sons.ts): o
// som de sons/ cortado nos quadros dele, com o fade, e a folga de silêncio na
// frente. Falso se o nome não for de um som tocado ou o som não existir.
export const gerarSomTocado = async (root: string, relativo: string, destino: string): Promise<boolean> => {
  const som = lerSomTocado(relativo);
  const origem = som ? caminhoDoSom(root, som.arquivo) : undefined;
  if (!som || !origem) {
    return false;
  }
  mkdirSync(path.dirname(destino), {recursive: true});
  // Mesma ordem do Remotion (formato, corte e volume) e só então a folga.
  const filtros = [
    `aformat=sample_fmts=s16:sample_rates=${TAXA}`,
    `atrim=end=${(som.quadros / som.fps).toFixed(6)}`,
    som.fadeMs > 0 ? `volume='${expressaoDoFade(som)}':eval=frame` : null,
    som.folgaMs > 0 ? `adelay=delays=${Math.round((som.folgaMs / 1000) * TAXA)}S:all=1` : null,
  ].filter(Boolean);
  await execFileAsync(ffmpegPath(), ["-y", "-i", origem, "-af", filtros.join(","), "-c:a", "pcm_s16le", destino]);
  return true;
};

// Som tocado guardado em cache (para a prévia): gera de novo se o som de sons/ mudou.
export const somTocadoEmCache = async (root: string, relativo: string, pastaDeCache: string): Promise<string | undefined> => {
  const som = lerSomTocado(relativo);
  const origem = som ? caminhoDoSom(root, som.arquivo) : undefined;
  if (!origem) {
    return undefined;
  }
  const destino = path.join(pastaDeCache, relativo);
  if (!existsSync(destino) || statSync(destino).mtimeMs < statSync(origem).mtimeMs) {
    await gerarSomTocado(root, relativo, destino);
  }
  return destino;
};

// Gera em pasta/ (a pasta sons/ do render) os sons que os efeitos tocam.
export const prepararSons = async (root: string, efeitos: EfeitoSonoro[], fps: number, pasta: string): Promise<string[]> => {
  const arquivos = [...new Set(efeitos.map((efeito) => somTocado(efeito, fps).arquivo))];
  for (const arquivo of arquivos) {
    if (!(await gerarSomTocado(root, arquivo, path.join(pasta, arquivo)))) {
      throw new Error(`O som ${arquivo} não existe em sons/.`);
    }
  }
  return arquivos;
};
