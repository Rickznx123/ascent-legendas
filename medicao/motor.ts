// Quanto o próprio motor desloca cada palavra em relação à fala, separado do erro
// da transcrição: entrada adiantada, arredondamento para quadros, animações com
// piscada e a linha do tempo (um bloco por vez, tempo mínimo de tela).
import {pathToFileURL} from "node:url";
import path from "node:path";
import {Easing} from "remotion";
import {AGRUPAMENTO_CONFIG} from "../src/agrupamento-config";
import {groupWords} from "../src/captions";
import {antecipacaoDaEntradaMs, blocosNaTela} from "../src/entrada";
import {assignForStyle} from "../src/motor/blocos";
import {loadCatalog, loadStyle} from "../src/motor/projeto";
import {computeTimeline} from "../src/tempos";
import type {EntranceAnimation, Word} from "../src/types";

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
};

const analisarAnimacao = (nome: string, anim: EntranceAnimation, fps: number, usadaEm: string[]): AnaliseDaAnimacao => {
  const antes = antecipacaoDaEntradaMs(anim);
  const quadroMs = 1000 / fps;
  // Para cada fase (fala em qualquer ponto entre dois quadros), o primeiro quadro
  // em que a palavra já está 70% visível.
  const primeiros: number[] = [];
  for (let fase = 0; fase < quadroMs; fase += 1) {
    const fala = 1000 + fase;
    const inicio = fala - antes;
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
  // Palavras que, por causa disso, não estão 70% visíveis quando são faladas.
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
): Promise<{animacoes: AnaliseDaAnimacao[]; linhaDoTempo: AnaliseDaLinhaDoTempo[]}> => {
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
    .map(([chave, {anim, onde}]) => analisarAnimacao(nomes.has(chave) ? `${nomes.get(chave)})` : [...onde][0], anim, fps, [...onde]))
    .sort((a, b) => b.comecaAntesMs - a.comecaAntesMs);

  // Linha do tempo: as palavras agrupadas como numa transcrição nova, em cada pacote.
  const blocosDaFala = groupWords(palavras);
  const linhaDoTempo: AnaliseDaLinhaDoTempo[] = [];
  for (const pacote of [...pacotes, "misto"]) {
    const estilo = await loadStyle(raiz, {pacote});
    const blocos = assignForStyle(blocosDaFala, estilo, {semente: 1});
    const naTela = blocosNaTela(blocos, estilo.templates, 0);
    const tempos = computeTimeline(naTela);
    let blocosAtrasados = 0;
    let atrasoMaximoMs = 0;
    let palavrasAtrasadas = 0;
    const saiAntes: {ms: number; texto: string}[] = [];
    const ultimaNaTela: number[] = [];
    blocos.forEach((bloco, i) => {
      const atraso = tempos[i].showMs - naTela[i].startMs;
      if (atraso > 0) {
        blocosAtrasados++;
        atrasoMaximoMs = Math.max(atrasoMaximoMs, atraso);
        palavrasAtrasadas += bloco.words.filter((w) => tempos[i].showMs > w.startMs).length;
      }
      const ultima = bloco.words[bloco.words.length - 1];
      if (i < blocos.length - 1 && bloco.dupla !== "primeiro") ultimaNaTela.push(tempos[i].hideMs - ultima.startMs);
      const antes = ultima.endMs - tempos[i].hideMs;
      // Dupla: o primeiro bloco fica até o segundo sair.
      if (antes > 0 && i < blocos.length - 1 && bloco.dupla !== "primeiro") {
        saiAntes.push({ms: antes, texto: `"${bloco.words.map((w) => w.text).join(" ")}" sai ${Math.round(antes)} ms antes do fim de "${ultima.text}"`});
      }
    });
    saiAntes.sort((a, b) => b.ms - a.ms);
    linhaDoTempo.push({
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
    });
  }
  return {animacoes, linhaDoTempo};
};

export const sincroniaPadraoMs = AGRUPAMENTO_CONFIG.sincroniaMs;
