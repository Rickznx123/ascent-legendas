// Props da composição CaptionedVideo a partir do transcricao.json, como o
// "npm run gerar -- <video> --usar-transcricao" monta, mas sem gravar o
// transcricao.json. O render local e o da nuvem usam exatamente estas props.
import path from "node:path";
import {assignForStyle, markShortBlocks, novaSemente} from "../src/motor/blocos";
import {getVideoMetadata} from "../src/motor/ferramentas";
import {listarSons} from "../src/motor/pasta-sons";
import {loadStyle, readProject} from "../src/motor/projeto";
import {configDosEfeitos, planejarEfeitos} from "../src/sons";
import {cortesDosExcluidos, sincroniaDoProjeto} from "../src/entrada";
import type {KineticCaptionVideoProps} from "../src/types";
import {RAIZ} from "./env";

export type PropsDoRender = Omit<KineticCaptionVideoProps, "videoSrc">;

export const montarProps = async (
  inputPath: string,
  escolha: {pacote?: string; paleta?: string} = {},
): Promise<PropsDoRender> => {
  const saved = readProject(RAIZ);
  if (!saved) {
    throw new Error("transcricao.json não existe.");
  }
  if (saved.source !== path.basename(inputPath)) {
    throw new Error(`transcricao.json pertence a '${saved.source}', não a '${path.basename(inputPath)}'.`);
  }
  const style = await loadStyle(RAIZ, escolha, saved);
  const semente = saved.semente ?? novaSemente();
  const blocks = markShortBlocks(
    assignForStyle(saved.blocks ?? [], style, {semente, preserveAssignments: saved.pacote === style.pacote}),
  );
  const efeitos = configDosEfeitos(saved.efeitos);
  const sincroniaMs = sincroniaDoProjeto(saved.sincroniaMs);
  const cortesMs = cortesDosExcluidos(saved.excluidos, style.templates, sincroniaMs);
  return {
    blocks,
    templates: style.templates,
    palette: style.palette,
    palettes: style.paletas,
    video: await getVideoMetadata(inputPath),
    efeitos: planejarEfeitos(blocks, style.templates, await listarSons(RAIZ), efeitos, semente, sincroniaMs, cortesMs),
    volumeEfeitos: efeitos.volume,
    sincroniaMs,
    posicao: saved.posicao,
    cortesMs,
  };
};
