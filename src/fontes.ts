// Fontes de todos os pacotes, da pasta fontes/ (carregadas sempre, para o modo
// misto). O render local, a prévia e o Lambda usam os mesmos arquivos: nada vem do
// Google Fonts na hora do render, e nada depende das fontes instaladas no computador.
//   pacote A — Inter Tight 500/600/800 e Instrument Serif itálica
//   pacote B — Inter Tight 300/600/800 e Playfair Display itálica 500
//   pacote C — Inter Tight 400 e itálica 800/900
//   pacote D — Hanken Grotesk 300/400/800
//   pacote E — Urbanist itálica 500, Hanken Grotesk 800 e EB Garamond itálica 700
//   pacote F — Inter Tight 700 e Instrument Serif itálica
// São as instâncias estáticas no peso exato (Fontsource 5.3.0, das fontes do Google),
// em dois arquivos por fonte: latin e latin-ext, com os mesmos intervalos do Google.
// Origem e licença (OFL) de cada uma: fontes/ORIGEM.md.
import ebGaramondLatin700Italic from "../fontes/eb-garamond-latin-700-italic.woff2";
import ebGaramondLatinExt700Italic from "../fontes/eb-garamond-latin-ext-700-italic.woff2";
import hankenLatin300 from "../fontes/hanken-grotesk-latin-300-normal.woff2";
import hankenLatin400 from "../fontes/hanken-grotesk-latin-400-normal.woff2";
import hankenLatin800 from "../fontes/hanken-grotesk-latin-800-normal.woff2";
import hankenLatinExt300 from "../fontes/hanken-grotesk-latin-ext-300-normal.woff2";
import hankenLatinExt400 from "../fontes/hanken-grotesk-latin-ext-400-normal.woff2";
import hankenLatinExt800 from "../fontes/hanken-grotesk-latin-ext-800-normal.woff2";
import instrumentLatin400Italic from "../fontes/instrument-serif-latin-400-italic.woff2";
import instrumentLatinExt400Italic from "../fontes/instrument-serif-latin-ext-400-italic.woff2";
import interTightLatin300 from "../fontes/inter-tight-latin-300-normal.woff2";
import interTightLatin400 from "../fontes/inter-tight-latin-400-normal.woff2";
import interTightLatin500 from "../fontes/inter-tight-latin-500-normal.woff2";
import interTightLatin600 from "../fontes/inter-tight-latin-600-normal.woff2";
import interTightLatin700 from "../fontes/inter-tight-latin-700-normal.woff2";
import interTightLatin800 from "../fontes/inter-tight-latin-800-normal.woff2";
import interTightLatin800Italic from "../fontes/inter-tight-latin-800-italic.woff2";
import interTightLatin900Italic from "../fontes/inter-tight-latin-900-italic.woff2";
import interTightLatinExt300 from "../fontes/inter-tight-latin-ext-300-normal.woff2";
import interTightLatinExt400 from "../fontes/inter-tight-latin-ext-400-normal.woff2";
import interTightLatinExt500 from "../fontes/inter-tight-latin-ext-500-normal.woff2";
import interTightLatinExt600 from "../fontes/inter-tight-latin-ext-600-normal.woff2";
import interTightLatinExt700 from "../fontes/inter-tight-latin-ext-700-normal.woff2";
import interTightLatinExt800 from "../fontes/inter-tight-latin-ext-800-normal.woff2";
import interTightLatinExt800Italic from "../fontes/inter-tight-latin-ext-800-italic.woff2";
import interTightLatinExt900Italic from "../fontes/inter-tight-latin-ext-900-italic.woff2";
import playfairLatin500Italic from "../fontes/playfair-display-latin-500-italic.woff2";
import playfairLatinExt500Italic from "../fontes/playfair-display-latin-ext-500-italic.woff2";
import urbanistLatin500Italic from "../fontes/urbanist-latin-500-italic.woff2";
import urbanistLatinExt500Italic from "../fontes/urbanist-latin-ext-500-italic.woff2";

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

type Fonte = {
  familia: string;
  peso: string;
  estilo: "normal" | "italic";
  arquivos: {latin: string; latinExt: string};
};

const FONTES: Fonte[] = [
  {familia: "Inter Tight", peso: "300", estilo: "normal", arquivos: {latin: interTightLatin300, latinExt: interTightLatinExt300}},
  {familia: "Inter Tight", peso: "400", estilo: "normal", arquivos: {latin: interTightLatin400, latinExt: interTightLatinExt400}},
  {familia: "Inter Tight", peso: "500", estilo: "normal", arquivos: {latin: interTightLatin500, latinExt: interTightLatinExt500}},
  {familia: "Inter Tight", peso: "600", estilo: "normal", arquivos: {latin: interTightLatin600, latinExt: interTightLatinExt600}},
  {familia: "Inter Tight", peso: "700", estilo: "normal", arquivos: {latin: interTightLatin700, latinExt: interTightLatinExt700}},
  {familia: "Inter Tight", peso: "800", estilo: "normal", arquivos: {latin: interTightLatin800, latinExt: interTightLatinExt800}},
  {familia: "Inter Tight", peso: "800", estilo: "italic", arquivos: {latin: interTightLatin800Italic, latinExt: interTightLatinExt800Italic}},
  {familia: "Inter Tight", peso: "900", estilo: "italic", arquivos: {latin: interTightLatin900Italic, latinExt: interTightLatinExt900Italic}},
  {familia: "Instrument Serif", peso: "400", estilo: "italic", arquivos: {latin: instrumentLatin400Italic, latinExt: instrumentLatinExt400Italic}},
  {familia: "Playfair Display", peso: "500", estilo: "italic", arquivos: {latin: playfairLatin500Italic, latinExt: playfairLatinExt500Italic}},
  {familia: "Hanken Grotesk", peso: "300", estilo: "normal", arquivos: {latin: hankenLatin300, latinExt: hankenLatinExt300}},
  {familia: "Hanken Grotesk", peso: "400", estilo: "normal", arquivos: {latin: hankenLatin400, latinExt: hankenLatinExt400}},
  {familia: "Hanken Grotesk", peso: "800", estilo: "normal", arquivos: {latin: hankenLatin800, latinExt: hankenLatinExt800}},
  {familia: "Urbanist", peso: "500", estilo: "italic", arquivos: {latin: urbanistLatin500Italic, latinExt: urbanistLatinExt500Italic}},
  {familia: "EB Garamond", peso: "700", estilo: "italic", arquivos: {latin: ebGaramondLatin700Italic, latinExt: ebGaramondLatinExt700Italic}},
];

const carregar = (familia: string, url: string, descritores: FontFaceDescriptors): Promise<unknown> => {
  const face = new FontFace(familia, `url(${url}) format("woff2")`, descritores);
  document.fonts.add(face);
  return face.load();
};

// Começa a carregar assim que o módulo é importado (fora do navegador, nada).
const carregando: Promise<unknown>[] =
  typeof FontFace === "undefined"
    ? []
    : FONTES.flatMap(({familia, peso, estilo, arquivos}) => [
        carregar(familia, arquivos.latin, {weight: peso, style: estilo, unicodeRange: LATIN}),
        carregar(familia, arquivos.latinExt, {weight: peso, style: estilo, unicodeRange: LATIN_EXT}),
      ]);

export const waitForFonts = (): Promise<unknown> => Promise.all(carregando);
