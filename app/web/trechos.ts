// A conta da timeline (PLANO-CORTES.md, Bloco 2), sem tela: dividir, aparar, excluir,
// mover e converter o tempo da timeline no tempo de cada vídeo. Tudo em ms. Nenhuma
// operação altera a lista: cada uma devolve outra (o desfazer guarda as antigas).
import type {Trecho} from "./api";

// Duração de cada vídeo (ms), pelo nome.
export type Duracoes = Record<string, number>;

// Menor trecho que um corte ou um aparo deixa sobrar.
export const MENOR_TRECHO_MS = 100;
// Quadros por segundo da prévia (e do vídeo montado no Bloco 4).
export const FPS = 30;

export const novoId = () => Math.random().toString(36).slice(2, 10);

export const fimDe = (t: Trecho, duracoes: Duracoes) => t.fimMs ?? duracoes[t.video] ?? t.inicioMs;
export const duracaoDe = (t: Trecho, duracoes: Duracoes) => fimDe(t, duracoes) - t.inicioMs;
export const duracaoTotal = (trechos: Trecho[], duracoes: Duracoes) => trechos.reduce((soma, t) => soma + duracaoDe(t, duracoes), 0);

// Onde cai um instante da timeline: o trecho, o começo dele na timeline e o instante no vídeo.
export const noVideo = (trechos: Trecho[], duracoes: Duracoes, ms: number) => {
  let comeco = 0;
  for (const [indice, t] of trechos.entries()) {
    const duracao = duracaoDe(t, duracoes);
    if (ms < comeco + duracao) return {indice, comeco, msNoVideo: t.inicioMs + Math.max(0, ms - comeco)};
    comeco += duracao;
  }
  return undefined;
};

// Na prévia cada trecho dura um número inteiro de quadros; as duas conversões usam a
// mesma conta, para o cursor não escorregar depois de muitos cortes.
const quadros = (ms: number) => Math.max(1, Math.round((ms * FPS) / 1000));
export const quadrosDe = (trechos: Trecho[], duracoes: Duracoes) => trechos.map((t) => quadros(duracaoDe(t, duracoes)));
export const quadroDe = (trechos: Trecho[], duracoes: Duracoes, ms: number) => {
  const ponto = noVideo(trechos, duracoes, ms);
  const lista = quadrosDe(trechos, duracoes);
  if (!ponto) return Math.max(0, lista.reduce((a, b) => a + b, 0) - 1);
  return lista.slice(0, ponto.indice).reduce((a, b) => a + b, 0) + Math.min(lista[ponto.indice] - 1, Math.round(((ms - ponto.comeco) * FPS) / 1000));
};
export const msDoQuadro = (trechos: Trecho[], duracoes: Duracoes, quadro: number) => {
  let comecoMs = 0;
  let comecoQuadro = 0;
  for (const [indice, n] of quadrosDe(trechos, duracoes).entries()) {
    const duracao = duracaoDe(trechos[indice], duracoes);
    if (quadro < comecoQuadro + n) return comecoMs + Math.min(duracao, ((quadro - comecoQuadro) * 1000) / FPS);
    comecoMs += duracao;
    comecoQuadro += n;
  }
  return comecoMs;
};

// Sem fimMs quando vai até o fim do vídeo (é assim que o "Pular" reconhece o vídeo inteiro).
const comFim = (t: Trecho, fimMs: number, duracoes: Duracoes): Trecho => {
  const {fimMs: _antigo, ...resto} = t;
  return fimMs >= (duracoes[t.video] ?? Infinity) ? resto : {...resto, fimMs};
};

const limitar = (valor: number, menor: number, maior: number) => Math.round(Math.min(maior, Math.max(menor, valor)));

// Divide no instante ms da timeline; perto demais de uma borda, não divide.
export const dividir = (trechos: Trecho[], duracoes: Duracoes, ms: number, id = novoId()): Trecho[] => {
  const ponto = noVideo(trechos, duracoes, ms);
  if (!ponto) return trechos;
  const t = trechos[ponto.indice];
  const corte = Math.round(ponto.msNoVideo);
  if (corte - t.inicioMs < MENOR_TRECHO_MS || fimDe(t, duracoes) - corte < MENOR_TRECHO_MS) return trechos;
  return [...trechos.slice(0, ponto.indice), comFim(t, corte, duracoes), {...t, id, inicioMs: corte}, ...trechos.slice(ponto.indice + 1)];
};

// Aparar: o novo começo ou fim do trecho, no tempo do vídeo (fica dentro do vídeo e
// nunca deixa o trecho menor que MENOR_TRECHO_MS).
export const aparar = (trechos: Trecho[], duracoes: Duracoes, id: string, lado: "inicio" | "fim", msNoVideo: number): Trecho[] =>
  trechos.map((t) => {
    if (t.id !== id) return t;
    const fim = fimDe(t, duracoes);
    return lado === "inicio"
      ? {...t, inicioMs: limitar(msNoVideo, 0, fim - MENOR_TRECHO_MS)}
      : comFim(t, limitar(msNoVideo, t.inicioMs + MENOR_TRECHO_MS, duracoes[t.video] ?? fim), duracoes);
  });

export const excluir = (trechos: Trecho[], id: string) => trechos.filter((t) => t.id !== id);

// Leva o trecho da posição de para a posição para (contada na lista final).
export const mover = (trechos: Trecho[], de: number, para: number): Trecho[] => {
  const lista = [...trechos];
  const [t] = lista.splice(de, 1);
  lista.splice(para, 0, t);
  return lista;
};

// "Remover pausas" (Bloco 3): cada trecho perde os pedaços que caem numa pausa do seu
// vídeo e vira um trecho por pedaço de fala (o primeiro mantém o id). Pedaço menor que
// MENOR_TRECHO_MS some. Nada mudou: devolve a mesma lista.
export const removerPausas = (trechos: Trecho[], duracoes: Duracoes, pausas: Record<string, [number, number][]>, ids = novoId): Trecho[] => {
  let mudou = false;
  const lista = trechos.flatMap((t) => {
    const fim = fimDe(t, duracoes);
    const pedacos: [number, number][] = [];
    let cursor = t.inicioMs;
    for (const [inicio, final] of [...(pausas[t.video] ?? [])].sort((a, b) => a[0] - b[0])) {
      if (final <= cursor || inicio >= fim) continue;
      if (inicio > cursor) pedacos.push([cursor, inicio]);
      cursor = Math.max(cursor, final);
    }
    if (cursor < fim) pedacos.push([cursor, fim]);
    const validos = pedacos.filter(([inicio, final]) => final - inicio >= MENOR_TRECHO_MS);
    if (validos.length === 1 && validos[0][0] === t.inicioMs && validos[0][1] === fim) return [t];
    mudou = true;
    return validos.map(([inicio, final], i) => comFim({...t, id: i === 0 ? t.id : ids(), inicioMs: inicio}, final, duracoes));
  });
  return mudou ? lista : trechos;
};

// Resumo dos trechos de uma montagem (Bloco 4): igual ao da timeline atual, os cortes
// não mudaram desde a última montagem (só a ordem, os vídeos e os tempos contam).
export const assinaturaDosTrechos = (trechos: Trecho[]): string => {
  const texto = JSON.stringify(trechos.map((t) => [t.video, t.inicioMs, t.fimMs ?? null]));
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) hash = Math.imul(hash ^ texto.charCodeAt(i), 0x01000193);
  return `${trechos.length}-${(hash >>> 0).toString(16)}`;
};
