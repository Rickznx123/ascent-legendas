// npx tsx nuvem/comparar-transcricoes.ts
// Transcreve o vídeo do transcricao.json duas vezes, pelo whisper.cpp local (o do
// app) e pela Groq, e compara: início das palavras, palavras diferentes e tempo.
// Também compara as duas com as palavras salvas no transcricao.json (que podem
// ter sido corrigidas à mão). Resultado em nuvem/resultados/comparacao-transcricoes.json.
import {writeFileSync} from "node:fs";
import path from "node:path";
import {groupWords} from "../src/captions";
import {readProject} from "../src/motor/projeto";
import {transcribeVideo} from "../src/motor/transcrever";
import type {Word} from "../src/types";
import {RAIZ} from "./env";
import {normalizar, transcreverGroq} from "./transcrever-groq";

type Operacao =
  | {tipo: "igual"; a: Word; b: Word}
  | {tipo: "trocada"; a: Word; b: Word}
  | {tipo: "so-em-a"; a: Word}
  | {tipo: "so-em-b"; b: Word};

// Alinhamento por distância de edição (palavra a palavra, texto normalizado).
const alinhar = (a: Word[], b: Word[]): Operacao[] => {
  const na = a.map((w) => normalizar(w.text));
  const nb = b.map((w) => normalizar(w.text));
  const custo = Array.from({length: a.length + 1}, (_, i) =>
    Array.from({length: b.length + 1}, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      custo[i][j] = Math.min(
        custo[i - 1][j - 1] + (na[i - 1] === nb[j - 1] ? 0 : 1),
        custo[i - 1][j] + 1,
        custo[i][j - 1] + 1,
      );
    }
  }
  const ops: Operacao[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && custo[i][j] === custo[i - 1][j - 1] + (na[i - 1] === nb[j - 1] ? 0 : 1)) {
      ops.push({tipo: na[i - 1] === nb[j - 1] ? "igual" : "trocada", a: a[i - 1], b: b[j - 1]});
      i--;
      j--;
    } else if (i > 0 && custo[i][j] === custo[i - 1][j] + 1) {
      ops.push({tipo: "so-em-a", a: a[--i]});
    } else {
      ops.push({tipo: "so-em-b", b: b[--j]});
    }
  }
  return ops.reverse();
};

const comparar = (nomeA: string, a: Word[], nomeB: string, b: Word[]) => {
  const ops = alinhar(a, b);
  const iguais = ops.filter((op): op is Extract<Operacao, {tipo: "igual"}> => op.tipo === "igual");
  const difs = iguais.map((op) => Math.abs(op.a.startMs - op.b.startMs));
  const media = difs.reduce((s, d) => s + d, 0) / Math.max(1, difs.length);
  const ordenadas = [...difs].sort((x, y) => x - y);
  const maior = iguais.reduce<(typeof iguais)[number] | undefined>(
    (m, op) => (!m || Math.abs(op.a.startMs - op.b.startMs) > Math.abs(m.a.startMs - m.b.startMs) ? op : m),
    undefined,
  );
  const diferencas = ops
    .filter((op) => op.tipo !== "igual")
    .map((op) =>
      op.tipo === "trocada"
        ? `${(op.a.startMs / 1000).toFixed(1)}s  ${nomeA}: "${op.a.text}"  ${nomeB}: "${op.b.text}"`
        : op.tipo === "so-em-a"
          ? `${(op.a.startMs / 1000).toFixed(1)}s  só ${nomeA}: "${op.a.text}"`
          : `${(op.b.startMs / 1000).toFixed(1)}s  só ${nomeB}: "${op.b.text}"`,
    );
  return {
    par: `${nomeA} × ${nomeB}`,
    palavras: {[nomeA]: a.length, [nomeB]: b.length},
    casadas: iguais.length,
    inicioMediaMs: Math.round(media),
    inicioMedianaMs: ordenadas[Math.floor(ordenadas.length / 2)] ?? 0,
    inicioP90Ms: ordenadas[Math.floor(ordenadas.length * 0.9)] ?? 0,
    inicioMaxMs: maior ? Math.abs(maior.a.startMs - maior.b.startMs) : 0,
    maiorDiferenca: maior ? `"${maior.a.text}" ${maior.a.startMs} ms × ${maior.b.startMs} ms` : "",
    palavrasDiferentes: diferencas.length,
    diferencas,
  };
};

const salvo = readProject(RAIZ);
if (!salvo) {
  throw new Error("transcricao.json não existe.");
}
const inputPath = path.join(RAIZ, salvo.source);

const inicioLocal = Date.now();
const local = await transcribeVideo(RAIZ, inputPath);
const localMs = Date.now() - inicioLocal;

const groq = await transcreverGroq(inputPath);

const resultado = {
  video: salvo.source,
  tempos: {
    localWhisperSmallMs: localMs,
    groqExtracaoAudioMs: groq.extracaoMs,
    groqRespostaMs: groq.respostaMs,
    groqAudioKb: Math.round(groq.audioKb),
  },
  blocos: {
    local: groupWords(local).length,
    groq: groupWords(groq.words).length,
    salvo: salvo.blocks.length,
  },
  comparacoes: [
    comparar("local", local, "groq", groq.words),
    comparar("salvo", salvo.words, "local", local),
    comparar("salvo", salvo.words, "groq", groq.words),
  ],
};
writeFileSync(path.join(RAIZ, "nuvem", "resultados", "comparacao-transcricoes.json"), JSON.stringify(resultado, null, 2));
for (const c of resultado.comparacoes) {
  const {diferencas, ...resumo} = c;
  console.log(JSON.stringify(resumo));
  for (const d of diferencas) console.log(`   ${d}`);
}
console.log(JSON.stringify({tempos: resultado.tempos, blocos: resultado.blocos}));
