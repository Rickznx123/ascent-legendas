// Casa duas transcrições do mesmo áudio palavra a palavra (a maior sequência em
// comum, comparando sem acento, pontuação nem maiúsculas) para comparar os textos
// e para usar o texto de uma com os tempos da outra.
import type {Word} from "../src/types";

export const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();

// Para cada palavra de a, o índice da palavra casada em b (ou -1).
export const casarPalavras = (a: Word[], b: Word[]): number[] => {
  const na = a.map((w) => normalizar(w.text));
  const nb = b.map((w) => normalizar(w.text));
  // Maior subsequência comum (programação dinâmica; algumas centenas de palavras).
  const tabela = Array.from({length: na.length + 1}, () => new Uint16Array(nb.length + 1));
  for (let i = na.length - 1; i >= 0; i--) {
    for (let j = nb.length - 1; j >= 0; j--) {
      tabela[i][j] = na[i] === nb[j] ? tabela[i + 1][j + 1] + 1 : Math.max(tabela[i + 1][j], tabela[i][j + 1]);
    }
  }
  const par = new Array<number>(na.length).fill(-1);
  for (let i = 0, j = 0; i < na.length && j < nb.length; ) {
    if (na[i] === nb[j]) {
      par[i++] = j++;
    } else if (tabela[i + 1][j] >= tabela[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return par;
};

export type Diferenca = {a: string; b: string; aMs: number};

// Trechos em que os textos diferem: o que a tem e b não, e vice-versa.
export const diferencas = (a: Word[], b: Word[]): {casadas: number; diferencas: Diferenca[]} => {
  const par = casarPalavras(a, b);
  const lista: Diferenca[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && par[i] === j) {
      i++;
      j++;
      continue;
    }
    // Junta o trecho até o próximo par casado.
    const proximoI = par.findIndex((p, k) => k >= i && p >= 0);
    const ateI = proximoI < 0 ? a.length : proximoI;
    const ateJ = proximoI < 0 ? b.length : par[proximoI];
    lista.push({
      a: a.slice(i, ateI).map((w) => w.text).join(" "),
      b: b.slice(j, ateJ).map((w) => w.text).join(" "),
      aMs: (a[i] ?? a[a.length - 1]).startMs,
    });
    i = ateI;
    j = ateJ;
  }
  return {casadas: par.filter((p) => p >= 0).length, diferencas: lista};
};

const letras = (texto: string) => Math.max(1, normalizar(texto).length);

// O texto de "texto" com os tempos de "tempos". Palavras casadas recebem os tempos
// da outra transcrição; as que não casam ficam no espaço entre as vizinhas casadas,
// dividido pelo número de letras (a mesma conta de captionsToWords).
export const textoComTempos = (texto: Word[], tempos: Word[]): {words: Word[]; naoCasadas: {text: string; antesMs: number; depoisMs: number}[]} => {
  const par = casarPalavras(texto, tempos);
  const words: Word[] = texto.map((w, i) => (par[i] >= 0 ? {text: w.text, startMs: tempos[par[i]].startMs, endMs: tempos[par[i]].endMs} : {...w}));
  const naoCasadas: {text: string; antesMs: number; depoisMs: number}[] = [];
  for (let i = 0; i < texto.length; ) {
    if (par[i] >= 0) {
      i++;
      continue;
    }
    let fim = i;
    while (fim < texto.length && par[fim] < 0) fim++;
    const de = i > 0 ? words[i - 1].endMs : Math.min(texto[i].startMs, words[fim]?.startMs ?? texto[i].startMs);
    const ate = Math.max(de, fim < texto.length ? words[fim].startMs : texto[fim - 1].endMs);
    const total = texto.slice(i, fim).reduce((s, w) => s + letras(w.text), 0);
    let cursor = de;
    for (let k = i; k < fim; k++) {
      const dur = ((ate - de) * letras(texto[k].text)) / total;
      words[k] = {text: texto[k].text, startMs: Math.round(cursor), endMs: Math.round(cursor + dur)};
      naoCasadas.push({text: texto[k].text, antesMs: texto[k].startMs, depoisMs: Math.round(cursor)});
      cursor += dur;
    }
    i = fim;
  }
  return {words, naoCasadas};
};
