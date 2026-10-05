// Quanto o próprio motor desloca cada palavra em relação à fala, separado do erro
// da transcrição: entrada adiantada, arredondamento para quadros, animações com
// piscada e a linha do tempo (um bloco por vez, tempo mínimo de tela).
import {pathToFileURL} from "node:url";
import path from "node:path";
import {Easing} from "remotion";
import {AGRUPAMENTO_CONFIG} from "../src/agrupamento-config";
import {groupWords} from "../src/captions";
import {encaixarNoAudio} from "../src/encaixe";
import {animacaoDaPalavra, antecipacaoDaEntradaMs, blocosNaTela, entradaAjustada} from "../src/entrada";
import {assignForStyle} from "../src/motor/blocos";
import {loadCatalog, loadStyle} from "../src/motor/projeto";
import {computeTimeline, findActiveBlockIndex} from "../src/tempos";
import type {AssignedCaptionBlock, CaptionTemplate, EntranceAnimation, SincroniaPrecisa, VozDoAudio, Word} from "../src/types";

const VISIVEL = 0.7;

// Opacidade da animação t ms depois do seu início (a mesma conta de AnimatedWord).
const opacidade = (anim: EntranceAnimation, t: number): number => {
  const linear = Math.min(1, Math.max(0, t / anim.durationMs));
  const ease = Easing.bezier(...anim.easing);
  const quadros = anim.keyframes?.opacity;
  if (!quadros) {
    return anim.fromOpacity + (1 - anim.fromOpacity) * ease(linear);
  }
  for (let i = 1; i < quadros.length; i++) {
    const [ate, valor] = quadros[i];
    const [de, anterior] = quadros[i - 1];
    if (linear <= ate) {
      const local = ate === de ? 1 : (linear - de) / (ate - de);
      return anterior + (valor - anterior) * ease(local);
    }
  }
  return quadros[quadros.length - 1][1];
};

export type AnaliseDaAnimacao = {
  nome: string;
  usadaEm: string[];
  duracaoMs: number;
  // Quanto antes da fala a palavra começa a entrar.
  comecaAntesMs: number;
  // Com quadros de 1000/fps ms: quando a palavra passa de 70% (relativo à fala;
  // negativo = antes), no melhor e no pior caso de fase dos quadros.
  setentaPorCentoMs: [number, number];
  // Quando a entrada termina (relativo à fala).
  terminaMs: number;
  // Trechos (relativos à fala) em que a palavra volta a ficar abaixo de 70% depois
  // de já ter passado (piscada).
  apagaDepoisMs: [number, number][];
  // Opacidade no quadro em que a palavra é falada (pior e melhor fase) e a menor
  // opacidade de lá até o fim da entrada.
  naFala: [number, number];
  menorDepoisDaFala: number;
};

const analisarAnimacao = (nome: string, anim: EntranceAnimation, fps: number, usadaEm: string[], precisa: boolean): AnaliseDaAnimacao => {
  const antes = antecipacaoDaEntradaMs(anim, precisa);
  const quadroMs = 1000 / fps;
  // Para cada fase (fala em qualquer ponto entre dois quadros), o primeiro quadro
  // em que a palavra já está 70% visível.
  const primeiros: number[] = [];
  const naFala: number[] = [];
  let menorDepoisDaFala = 1;
  for (let fase = 0; fase < quadroMs; fase += 1) {
    const fala = 1000 + fase;
    const inicio = fala - antes;
    const quadroDaFala = Math.floor(fala / quadroMs);
    naFala.push(opacidade(anim, quadroDaFala * quadroMs - inicio));
    for (let k = quadroDaFala; k * quadroMs < inicio + anim.durationMs + quadroMs; k++) {
      menorDepoisDaFala = Math.min(menorDepoisDaFala, opacidade(anim, k * quadroMs - inicio));
    }
    for (let k = Math.ceil(inicio / quadroMs); k * quadroMs < inicio + anim.durationMs + 100; k++) {
      if (opacidade(anim, k * quadroMs - inicio) >= VISIVEL) {
        primeiros.push(k * quadroMs - fala);
        break;
      }
    }
  }
  // Piscada: depois de passar de 70%, quando volta a ficar abaixo.
  const apaga: [number, number][] = [];
  let passou = false;
  let abaixoDesde: number | undefined;
  for (let t = 0; t <= anim.durationMs; t += 1) {
    const o = opacidade(anim, t);
    if (!passou) {
      passou = o >= VISIVEL;
      continue;
    }
    if (o < VISIVEL && abaixoDesde === undefined) abaixoDesde = t;
    if (o >= VISIVEL && abaixoDesde !== undefined) {
      apaga.push([Math.round(abaixoDesde - antes), Math.round(t - antes)]);
      abaixoDesde = undefined;
    }
  }
  return {
    nome,
    usadaEm,
    duracaoMs: anim.durationMs,
    comecaAntesMs: Math.round(antes),
    setentaPorCentoMs: [Math.round(Math.min(...primeiros)), Math.round(Math.max(...primeiros))],
    terminaMs: Math.round(anim.durationMs - antes),
    apagaDepoisMs: apaga,
    naFala: [Math.min(...naFala), Math.max(...naFala)],
    menorDepoisDaFala,
  };
};

// Nome de cada animação: a constante exportada no _estilos.ts do pacote.
const assinatura = (anim: EntranceAnimation): string => JSON.stringify(anim);

const nomesDasAnimacoes = async (raiz: string, pacotes: string[]): Promise<Map<string, string>> => {
  const nomes = new Map<string, string>();
  for (const pacote of pacotes) {
    const arquivo = path.join(raiz, "templates", `pacote-${pacote}`, "_estilos.ts");
    try {
      const modulo = (await import(pathToFileURL(arquivo).href)) as Record<string, unknown>;
      for (const [nome, valor] of Object.entries(modulo)) {
        if (valor && typeof valor === "object" && "durationMs" in valor && "easing" in valor) {
          const chave = assinatura(valor as EntranceAnimation);
          nomes.set(chave, nomes.has(chave) ? `${nomes.get(chave)}, ${pacote.toUpperCase()}` : `${nome} (${pacote.toUpperCase()}`);
        }
      }
    } catch {
      // Sem _estilos.ts: as animações ficam com o nome do layout.
    }
  }
  return nomes;
};

export type AnaliseDaLinhaDoTempo = {
  pacote: string;
  blocos: number;
  // Blocos que entram depois da hora (empurrados pelo anterior).
  blocosAtrasados: number;
  atrasoMaximoMs: number;
  // Palavras que não estão 70% visíveis no quadro em que são faladas.
  palavrasAtrasadas: number;
  // Bloco que sai da tela antes de a última palavra dele terminar de ser falada
  // (o seguinte entra adiantado e só um bloco aparece por vez).
  saiAntesDoFim: number;
  saiAntesMedianaMs: number;
  saiAntesMaximoMs: number;
  exemplosSaiAntes: string[];
  // Última palavra de cada bloco: tempo na tela depois de começar a ser falada
  // (mediana e menor) e quantas ficam menos de 200 ms.
  ultimaNaTelaMedianaMs: number;
  ultimaNaTelaMenorMs: number;
  ultimaNaTelaMenosDe200: number;
  // Palavras abaixo de 70% no quadro da fala, com a opacidade.
  invisiveis: string[];
};

const mediana = (v: number[]) => {
  if (!v.length) return 0;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};

export const analisarMotor = async (
  raiz: string,
  palavras: Word[],
  fps: number,
  // voz: régua do instante falado (as palavras encaixadas no áudio); precisa: liga a
  // Sincronia precisa no motor.
  {voz, precisa}: {voz?: VozDoAudio; precisa?: SincroniaPrecisa} = {},
): Promise<{animacoes: AnaliseDaAnimacao[]; linhaDoTempo: AnaliseDaLinhaDoTempo[]}> => {
  const referencia = voz ? encaixarNoAudio(palavras, voz).palavras : undefined;
  const pacotes = loadCatalog(raiz).pacotes;
  const nomes = await nomesDasAnimacoes(raiz, pacotes);

  // Animações em uso (iguais contam uma vez), com onde aparecem.
  const usos = new Map<string, {anim: EntranceAnimation; onde: Set<string>}>();
  const estiloMisto = await loadStyle(raiz, {pacote: "misto"});
  for (const [layout, template] of Object.entries(estiloMisto.templates)) {
    const {word, keyword, linearPair} = template.animations;
    const marcar = (anim: EntranceAnimation | undefined, papel: string) => {
      if (!anim) return;
      const chave = assinatura(anim);
      if (!usos.has(chave)) usos.set(chave, {anim, onde: new Set()});
      usos.get(chave)!.onde.add(`${layout} ${papel}`);
    };
    marcar(word, "palavra");
    marcar(keyword, "chave");
    linearPair?.forEach((anim, i) => marcar(anim, `par ${i + 1}`));
  }
  const animacoes = [...usos.entries()]
    .map(([chave, {anim, onde}]) =>
      analisarAnimacao(nomes.has(chave) ? `${nomes.get(chave)})` : [...onde][0], anim, fps, [...onde], Boolean(precisa)),
    )
    .sort((a, b) => b.comecaAntesMs - a.comecaAntesMs);

  // Linha do tempo: as palavras agrupadas como numa transcrição nova, em cada pacote.
  const blocosDaFala = groupWords(palavras);
  const linhaDoTempo: AnaliseDaLinhaDoTempo[] = [];
  for (const pacote of [...pacotes, "misto"]) {
    const estilo = await loadStyle(raiz, {pacote});
    const blocos = assignForStyle(blocosDaFala, estilo, {semente: 1});
    linhaDoTempo.push(analisarLinhaDoTempo(pacote, blocos, estilo.templates, fps, referencia, precisa).resumo);
  }
  return {animacoes, linhaDoTempo};
};

export type TrocaDoBloco = {
  texto: string;
  ultima: string;
  // Tempos relativos ao início falado da última palavra.
  ultimaDuracaoMs: number;
  saiDepoisMs: number;
  // Quanto a última palavra sai antes do fim dela (positivo = antes; só conta se o
  // bloco seguinte entrou, não o fim da permanência).
  saiAntesDoFimMs: number;
  // O bloco seguinte: quando entra em relação à primeira palavra dele (negativo =
  // antes) e quanto ela está visível no quadro em que é falada.
  seguinteEntraMs?: number;
  seguinteVisivelNaFala?: number;
  seguinteVisivelUmQuadroDepois?: number;
  silencioAteSeguinteMs?: number;
};

// Uma linha do tempo completa, como o render a desenha (mesmas funções).
// referencia: o instante falado de cada palavra (o do áudio, quando houver), para
// medir os dois modos com a mesma régua.
const analisarLinhaDoTempo = (
  pacote: string,
  blocos: AssignedCaptionBlock[],
  templates: Record<string, CaptionTemplate>,
  fps: number,
  referencia: Word[] | undefined,
  precisa: SincroniaPrecisa | undefined,
): {resumo: AnaliseDaLinhaDoTempo; trocas: TrocaDoBloco[]} => {
  const naTela = blocosNaTela(blocos, templates, 0, precisa);
  const tempos = computeTimeline(naTela, [], fps);
  const quadroMs = 1000 / fps;
  // Instante falado de cada palavra, na régua comum.
  let cursor = 0;
  const ref = blocos.map((b) => b.words.map((w) => referencia?.[cursor++] ?? w));

  // Opacidade da palavra k do bloco i no quadro em que ela é falada.
  // quadros: 0 = o quadro na tela no instante da fala; 1 = o seguinte.
  const visivelNaFala = (i: number, k: number, quadros = 0): number => {
    // O início do quadro, na mesma conta do render (quadro / fps * 1000).
    const t = ((Math.floor((ref[i][k].startMs * fps) / 1000 + 1e-6) + quadros) / fps) * 1000;
    const ativo = findActiveBlockIndex(tempos, t);
    const dono = ativo === i || (ativo === i - 1 && blocos[i].dupla === "segundo");
    if (!dono) return 0;
    const palavra = naTela[i].words[k];
    const inicio = Math.max(palavra.startMs, tempos[i].showMs);
    const template = templates[blocos[i].template];
    const anim = entradaAjustada(animacaoDaPalavra(naTela[i], template, k), inicio, palavra.faladaMs, quadroMs);
    return opacidade(anim, t - inicio);
  };

  let blocosAtrasados = 0;
  let atrasoMaximoMs = 0;
  let palavrasAtrasadas = 0;
  const saiAntes: {ms: number; texto: string}[] = [];
  const ultimaNaTela: number[] = [];
  const trocas: TrocaDoBloco[] = [];
  const invisiveis: string[] = [];
  blocos.forEach((bloco, i) => {
    const atraso = tempos[i].showMs - naTela[i].startMs;
    if (atraso > 0) {
      blocosAtrasados++;
      atrasoMaximoMs = Math.max(atrasoMaximoMs, atraso);
    }
    bloco.words.forEach((w, k) => {
      const v = visivelNaFala(i, k);
      if (v < VISIVEL) {
        palavrasAtrasadas++;
        invisiveis.push(`${w.text} ${Math.round(v * 100)}%${k === 0 ? " (1ª do bloco)" : ""}`);
      }
    });
    const ultima = ref[i][bloco.words.length - 1];
    const texto = bloco.words.map((w) => w.text).join(" ");
    // Dupla: o primeiro bloco fica até o segundo sair.
    if (i < blocos.length - 1 && bloco.dupla !== "primeiro") {
      ultimaNaTela.push(tempos[i].hideMs - ultima.startMs);
      const antes = ultima.endMs - tempos[i].hideMs;
      if (antes > 0) {
        saiAntes.push({ms: antes, texto: `"${texto}" sai ${Math.round(antes)} ms antes do fim de "${ultima.text}"`});
      }
    }
    const seguinte = blocos[i + 1];
    trocas.push({
      texto,
      ultima: ultima.text,
      ultimaDuracaoMs: Math.round(ultima.endMs - ultima.startMs),
      saiDepoisMs: Math.round(tempos[i].hideMs - ultima.startMs),
      saiAntesDoFimMs: Math.round(ultima.endMs - tempos[i].hideMs),
      seguinteEntraMs: seguinte ? Math.round(tempos[i + 1].showMs - ref[i + 1][0].startMs) : undefined,
      seguinteVisivelNaFala: seguinte ? visivelNaFala(i + 1, 0) : undefined,
      seguinteVisivelUmQuadroDepois: seguinte ? visivelNaFala(i + 1, 0, 1) : undefined,
      silencioAteSeguinteMs: seguinte ? Math.round(ref[i + 1][0].startMs - ultima.endMs) : undefined,
    });
  });
  saiAntes.sort((a, b) => b.ms - a.ms);
  return {
    resumo: {
      pacote,
      blocos: blocos.length,
      blocosAtrasados,
      atrasoMaximoMs: Math.round(atrasoMaximoMs),
      palavrasAtrasadas,
      saiAntesDoFim: saiAntes.length,
      saiAntesMedianaMs: Math.round(mediana(saiAntes.map((s) => s.ms))),
      saiAntesMaximoMs: Math.round(saiAntes[0]?.ms ?? 0),
      exemplosSaiAntes: saiAntes.slice(0, 3).map((s) => s.texto),
      ultimaNaTelaMedianaMs: Math.round(mediana(ultimaNaTela)),
      ultimaNaTelaMenorMs: Math.round(Math.min(...ultimaNaTela)),
      ultimaNaTelaMenosDe200: ultimaNaTela.filter((ms) => ms < 200).length,
      invisiveis,
    },
    trocas,
  };
};

// Trocas de bloco de um pacote com a Sincronia precisa desligada e ligada, na
// mesma régua (os tempos encaixados no áudio).
export const compararTrocas = async (
  raiz: string,
  palavras: Word[],
  fps: number,
  voz: VozDoAudio,
  pacote: string,
): Promise<{desligada: TrocaDoBloco[]; ligada: TrocaDoBloco[]}> => {
  const estilo = await loadStyle(raiz, {pacote});
  const blocos = assignForStyle(groupWords(palavras), estilo, {semente: 1});
  const referencia = encaixarNoAudio(palavras, voz).palavras;
  return {
    desligada: analisarLinhaDoTempo(pacote, blocos, estilo.templates, fps, referencia, undefined).trocas,
    ligada: analisarLinhaDoTempo(pacote, blocos, estilo.templates, fps, referencia, {voz, fps}).trocas,
  };
};

export const sincroniaPadraoMs = AGRUPAMENTO_CONFIG.sincroniaMs;
