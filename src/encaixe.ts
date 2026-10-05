// Encaixe no áudio (Sincronia precisa): o início de uma palavra perto de um
// começo de voz gruda nele, e o fim perto do começo de um silêncio gruda nele.
// O Whisper (local e Groq) acerta bem onde a fala recomeça, mas costuma esticar o
// fim da palavra por cima do silêncio seguinte; os trechos de voz vêm do áudio
// (src/motor/voz.ts) e ficam salvos no projeto. Funções puras: o render (local e
// na nuvem), a prévia e os efeitos sonoros usam o mesmo encaixe.
import type {VozDoAudio, Word} from "./types";

export const ENCAIXE_CONFIG = {
  // Distância máxima (ms) entre o início da palavra e o começo de voz para grudar.
  inicioMaximoMs: 350,
  // Distância máxima (ms) entre o fim da palavra e o começo do silêncio.
  fimMaximoMs: 450,
  // Silêncio mínimo (ms) antes do primeiro trecho e depois do último para valerem
  // como começo e fim de voz (os do meio já são separados por silêncio).
  silencioMinimoMs: 150,
  // Nenhuma palavra fica mais curta que isto (ms) depois do encaixe.
  duracaoMinimaMs: 60,
  // Casamento duvidoso: num trecho de voz, o tempo por letra das palavras que caem
  // nele fica fora desta faixa (ms). A transcrição pulou fala (tempo demais por
  // letra) ou pôs palavras onde não há voz (tempo de menos). Esse trecho não encaixa.
  msPorLetraMinimo: 25,
  msPorLetraMaximo: 220,
};

const letras = (texto: string) => texto.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "").length;

// Trecho de voz de cada palavra: o que contém o meio dela, senão o mais próximo.
const trechoDaPalavra = (palavra: Word, trechos: [number, number][]): number => {
  const meio = (palavra.startMs + palavra.endMs) / 2;
  let melhor = -1;
  let distancia = Number.POSITIVE_INFINITY;
  trechos.forEach(([inicio, fim], indice) => {
    const d = meio < inicio ? inicio - meio : meio > fim ? meio - fim : 0;
    if (d < distancia) {
      distancia = d;
      melhor = indice;
    }
  });
  return melhor;
};

export type Encaixe = {
  palavras: Word[];
  // Quantos inícios e fins grudaram e quantos trechos foram pulados por dúvida.
  inicios: number;
  fins: number;
  trechosDuvidosos: number;
};

// Palavras (na ordem da fala) com os inícios e fins encaixados na voz.
export const encaixarNoAudio = (palavras: Word[], voz: VozDoAudio): Encaixe => {
  const cfg = ENCAIXE_CONFIG;
  const {trechos} = voz;
  const saida = palavras.map((palavra) => ({...palavra}));
  if (trechos.length === 0 || palavras.length === 0) {
    return {palavras: saida, inicios: 0, fins: 0, trechosDuvidosos: 0};
  }

  // Palavras de cada trecho (índices, em ordem).
  const doTrecho: number[][] = trechos.map(() => []);
  palavras.forEach((palavra, indice) => doTrecho[trechoDaPalavra(palavra, trechos)].push(indice));

  // Trecho duvidoso: sem palavras (a transcrição pulou a fala) ou com tempo por
  // letra fora da faixa. Os vizinhos de um trecho sem palavras também não encaixam
  // o lado virado para ele (a palavra ao lado pode ter absorvido a fala pulada).
  const duvidoso = trechos.map(([inicio, fim], k) => {
    const total = doTrecho[k].reduce((soma, indice) => soma + letras(palavras[indice].text), 0);
    if (total === 0) {
      return true;
    }
    const msPorLetra = (fim - inicio) / total;
    return msPorLetra < cfg.msPorLetraMinimo || msPorLetra > cfg.msPorLetraMaximo;
  });
  const vazio = (k: number) => k >= 0 && k < trechos.length && doTrecho[k].length === 0;

  const novoInicio = new Map<number, number>();
  const novoFim = new Map<number, number>();
  trechos.forEach(([inicio, fim], k) => {
    const indices = doTrecho[k];
    if (duvidoso[k] || indices.length === 0) {
      return;
    }
    const primeira = indices[0];
    const ultima = indices[indices.length - 1];
    const comecaDepoisDeSilencio = k > 0 || inicio >= cfg.silencioMinimoMs;
    const terminaAntesDeSilencio = k < trechos.length - 1 || voz.duracaoMs - fim >= cfg.silencioMinimoMs;
    if (comecaDepoisDeSilencio && !vazio(k - 1) && Math.abs(palavras[primeira].startMs - inicio) <= cfg.inicioMaximoMs) {
      novoInicio.set(primeira, inicio);
    }
    if (terminaAntesDeSilencio && !vazio(k + 1) && Math.abs(palavras[ultima].endMs - fim) <= cfg.fimMaximoMs) {
      novoFim.set(ultima, fim);
    }
  });

  // Aplica na ordem, sem inverter nem sobrepor vizinhas: um encaixe que deixaria a
  // palavra curta demais, ou que passaria por cima da vizinha, não vale.
  let inicios = 0;
  let fins = 0;
  saida.forEach((palavra, indice) => {
    const anterior = saida[indice - 1];
    const inicio = novoInicio.get(indice);
    if (inicio !== undefined && (!anterior || inicio >= anterior.startMs + cfg.duracaoMinimaMs)) {
      const fim = novoFim.get(indice) ?? palavra.endMs;
      if (fim - inicio >= cfg.duracaoMinimaMs) {
        palavra.startMs = inicio;
        // A anterior termina no máximo onde esta começa agora.
        if (anterior && anterior.endMs > inicio) {
          anterior.endMs = inicio;
        }
        inicios++;
      }
    }
    const fim = novoFim.get(indice);
    const seguinte = palavras[indice + 1];
    if (fim !== undefined && fim - palavra.startMs >= cfg.duracaoMinimaMs) {
      // A seguinte começa depois de um silêncio: o fim não pode passar dela.
      const limite = seguinte ? (novoInicio.get(indice + 1) ?? seguinte.startMs) : Number.POSITIVE_INFINITY;
      if (fim <= limite) {
        palavra.endMs = fim;
        fins++;
      }
    }
  });
  return {palavras: saida, inicios, fins, trechosDuvidosos: duvidoso.filter(Boolean).length};
};
