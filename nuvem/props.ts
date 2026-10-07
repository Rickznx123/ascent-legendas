// Props da composição CaptionedVideo a partir de um projeto (padrão: o
// transcricao.json), como o "npm run gerar -- <video> --usar-transcricao" monta,
// mas sem gravar nada. O render local e o da nuvem usam exatamente estas props.
import path from "node:path";
import {assignForStyle, markShortBlocks, novaSemente} from "../src/motor/blocos";
import {getVideoMetadata} from "../src/motor/ferramentas";
import {listarSons} from "../src/motor/pasta-sons";
import {detectarVozDoVideo} from "../src/motor/voz";
import {loadStyle, readProject} from "../src/motor/projeto";
import type {Projeto} from "../src/motor/projeto";
import {configDosEfeitos, planejarEfeitos} from "../src/sons";
import {cortesDosExcluidos, precisaoDoProjeto, sincroniaDoProjeto} from "../src/entrada";
import type {KineticCaptionVideoProps} from "../src/types";
import {RAIZ} from "./env";

export type PropsDoRender = Omit<KineticCaptionVideoProps, "videoSrc">;

export const montarProps = async (
  inputPath: string,
  escolha: {pacote?: string; paleta?: string} = {},
  // Projeto salvo à parte (ex.: nuvem/transcrever.ts); sem ele, o transcricao.json.
  projeto?: Projeto,
): Promise<PropsDoRender> => {
  const saved = projeto ?? readProject(RAIZ);
  const nome = projeto ? "O projeto" : "transcricao.json";
  if (!saved) {
    throw new Error("transcricao.json não existe.");
  }
  if (saved.source !== path.basename(inputPath)) {
    throw new Error(`${nome} pertence a '${saved.source}', não a '${path.basename(inputPath)}'.`);
  }
  const style = await loadStyle(RAIZ, escolha, saved);
  const semente = saved.semente ?? novaSemente();
  const blocks = markShortBlocks(
    assignForStyle(saved.blocks ?? [], style, {semente, preserveAssignments: saved.pacote === style.pacote}),
  );
  const efeitos = configDosEfeitos(saved.efeitos);
  const sincroniaMs = sincroniaDoProjeto(saved.sincroniaMs, saved.sincroniaPrecisa);
  // A mesma Sincronia precisa do render local: a voz do áudio vai junto nas props.
  // Projeto sem a voz salva (transcrito antes da detecção): detecta agora.
  const voz = saved.voz ?? (saved.sincroniaPrecisa ? await detectarVozDoVideo(inputPath) : undefined);
  const video = await getVideoMetadata(inputPath);
  const precisa = precisaoDoProjeto({...saved, voz}, video.fps);
  const cortesMs = cortesDosExcluidos(saved.excluidos, style.templates, sincroniaMs, precisa);
  return {
    blocks,
    templates: style.templates,
    palette: style.palette,
    palettes: style.paletas,
    video,
    efeitos: planejarEfeitos(blocks, style.templates, await listarSons(RAIZ), efeitos, semente, sincroniaMs, cortesMs, precisa),
    volumeEfeitos: efeitos.volume,
    sincroniaMs,
    precisa,
    posicao: saved.posicao,
    cortesMs,
    entradaLinear: saved.entradaLinear,
  };
};
