// npm run landing:estilos [-- a c misto]
// Clipes dos cartões de "Estilos de legenda" da página de apresentação, renderizados
// neste computador (sem Lambda) com os templates reais de cada pacote: destaque,
// linear, destaque, sobre o degradê do cartão, sem som. Saída em
// app/web/public/landing/estilos/<pacote>.mp4 e o poster <pacote>.jpg.
// Rode de novo quando um pacote mudar (só os pacotes passados, ou todos).
import {mkdirSync, statSync} from "node:fs";
import path from "node:path";
import {bundle} from "@remotion/bundler";
import {renderMedia, renderStill, selectComposition} from "@remotion/renderer";
import {findKeywordIndex} from "../src/captions";
import {PACOTE_MISTO} from "../src/motor/blocos";
import {loadStyle} from "../src/motor/projeto";
import {layoutForKeyword} from "../src/rhythm";
import type {AssignedCaptionBlock, KineticCaptionVideoProps, TemplateFamily} from "../src/types";

const RAIZ = process.cwd();
const SAIDA = path.join(RAIZ, "app", "web", "public", "landing", "estilos");
const VIDEO = {width: 480, height: 600, fps: 30};
// Alvo de tamanho por clipe (só avisa se passar).
const ALVO_BYTES = 300 * 1024;

// Ritmo: cada palavra entra PASSO_MS depois da anterior; o bloco fica SEGURA_MS
// depois da última palavra. O clipe começa e termina sem legenda (o loop não dá tranco).
const INICIO_MS = 250;
const PASSO_MS = 230;
const SEGURA_MS = 1050;
const FIM_MS = 450;

type Frase = {familia: TemplateFamily; texto: string; chave?: string; pacote?: string};
type Clipe = {nome: string; pacote: string; paleta: string; frases: [Frase, Frase, Frase]};

// Frases dos cartões da página, completadas no mesmo tom. Paleta: a cor de
// destaque do cartão.
const CLIPES: Clipe[] = [
  {
    nome: "a",
    pacote: "a",
    paleta: "lavanda",
    frases: [
      {familia: "destaque", texto: "tem novidade chegando", chave: "novidade"},
      {familia: "linear", texto: "e é pra você"},
      {familia: "destaque", texto: "vem ver de perto", chave: "perto"},
    ],
  },
  {
    nome: "b",
    pacote: "b",
    paleta: "vermelho",
    frases: [
      {familia: "destaque", texto: "o segredo é esse", chave: "segredo"},
      {familia: "linear", texto: "ninguém te conta isso"},
      {familia: "destaque", texto: "cuidar de você", chave: "você"},
    ],
  },
  {
    nome: "c",
    pacote: "c",
    paleta: "neon",
    frases: [
      {familia: "destaque", texto: "olha esse imóvel", chave: "imóvel"},
      {familia: "linear", texto: "com vista pro mar"},
      {familia: "destaque", texto: "agende sua visita", chave: "visita"},
    ],
  },
  {
    nome: "d",
    pacote: "d",
    paleta: "branco",
    frases: [
      {familia: "destaque", texto: "isso muda tudo", chave: "tudo"},
      {familia: "linear", texto: "presta atenção aqui"},
      {familia: "destaque", texto: "sua nova rotina", chave: "rotina"},
    ],
  },
  {
    nome: "e",
    pacote: "e",
    paleta: "dourado",
    frases: [
      {familia: "destaque", texto: "você vai amar esse resultado", chave: "amar"},
      {familia: "linear", texto: "em poucos dias"},
      {familia: "destaque", texto: "um cuidado especial", chave: "cuidado"},
    ],
  },
  {
    nome: "f",
    pacote: "f",
    paleta: "branco",
    frases: [
      {familia: "destaque", texto: "feito para vender", chave: "vender"},
      {familia: "linear", texto: "sem complicar nada"},
      {familia: "destaque", texto: "o app faz tudo", chave: "tudo"},
    ],
  },
  {
    nome: "misto",
    pacote: PACOTE_MISTO,
    paleta: "neon",
    // Um pacote diferente em cada bloco.
    frases: [
      {familia: "destaque", texto: "um pouco de cada estilo", chave: "estilo", pacote: "b"},
      {familia: "linear", texto: "no mesmo vídeo", pacote: "a"},
      {familia: "destaque", texto: "tudo misturado", chave: "misturado", pacote: "c"},
    ],
  },
];

// Blocos do clipe com o layout que as regras do pacote escolhem para cada frase.
const montarBlocos = async (clipe: Clipe) => {
  const estilo = await loadStyle(RAIZ, {pacote: clipe.pacote, paleta: clipe.paleta});
  let tempo = INICIO_MS;
  const blocks = clipe.frases.map((frase): AssignedCaptionBlock => {
    const words = frase.texto.split(" ").map((text) => {
      const word = {text, startMs: tempo, endMs: tempo + PASSO_MS};
      tempo += PASSO_MS;
      return word;
    });
    const fim = words[words.length - 1].startMs + SEGURA_MS;
    words[words.length - 1].endMs = fim;
    tempo = fim;
    const regras = estilo.pacotes[frase.pacote ?? clipe.pacote];
    const bloco: AssignedCaptionBlock = {
      words,
      startMs: words[0].startMs,
      endMs: fim,
      keyword: frase.chave ?? "",
      family: frase.familia,
      template: "",
      pacote: clipe.pacote === PACOTE_MISTO ? regras.name : undefined,
    };
    const layout =
      frase.familia === "linear"
        ? regras.config.linear
        : layoutForKeyword(bloco, findKeywordIndex(words, bloco.keyword), regras.config);
    const template = regras.prefix + layout;
    if (estilo.templates[template]?.structure === "dupla") {
      throw new Error(`${clipe.nome}: "${frase.texto}" caiu num layout de dupla (${template}); troque a frase.`);
    }
    return {...bloco, template, layoutManual: true};
  });
  const ultimo = blocks[blocks.length - 1];
  const props: KineticCaptionVideoProps = {
    videoSrc: "",
    blocks,
    templates: estilo.templates,
    palette: estilo.palette,
    palettes: estilo.paletas,
    video: {...VIDEO, durationInFrames: Math.ceil(((ultimo.endMs + FIM_MS) / 1000) * VIDEO.fps)},
    posicao: {x: 50, y: 50},
  };
  // Poster: o primeiro bloco já todo na tela.
  const primeiro = blocks[0];
  const posterMs = primeiro.words[primeiro.words.length - 1].startMs + 700;
  return {props, poster: Math.round((posterMs / 1000) * VIDEO.fps), layouts: blocks.map((b) => b.template)};
};

const pedidos = process.argv.slice(2);
const clipes = pedidos.length > 0 ? CLIPES.filter((clipe) => pedidos.includes(clipe.nome)) : CLIPES;
if (clipes.length === 0) {
  throw new Error(`Nenhum pacote com esse nome. Disponíveis: ${CLIPES.map((clipe) => clipe.nome).join(", ")}.`);
}

mkdirSync(SAIDA, {recursive: true});
console.log("Preparando a composição...");
const serveUrl = await bundle({entryPoint: path.join(RAIZ, "scripts", "landing-estilos", "raiz.tsx")});

for (const clipe of clipes) {
  const {props, poster, layouts} = await montarBlocos(clipe);
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({serveUrl, id: "ClipeDoEstilo", inputProps});
  const mp4 = path.join(SAIDA, `${clipe.nome}.mp4`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    muted: true,
    crf: 30,
    x264Preset: "slow",
    outputLocation: mp4,
    inputProps,
  });
  await renderStill({
    composition,
    serveUrl,
    frame: poster,
    imageFormat: "jpeg",
    jpegQuality: 80,
    output: path.join(SAIDA, `${clipe.nome}.jpg`),
    inputProps,
  });
  const bytes = statSync(mp4).size;
  const segundos = composition.durationInFrames / composition.fps;
  console.log(
    `${clipe.nome}: ${(bytes / 1024).toFixed(0)} KB, ${segundos.toFixed(1)} s, paleta ${clipe.paleta}, layouts ${layouts.join(" · ")}` +
      (bytes > ALVO_BYTES ? "  ⚠ acima de 300 KB" : ""),
  );
}
