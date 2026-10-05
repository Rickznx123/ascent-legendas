// A galeria de templates ligada ao projeto aberto (usada nos dois layouts).
import {Galeria} from "./Galeria";
import type {Editor} from "./useEditor";

export const GaleriaDoProjeto: React.FC<{e: Editor}> = ({e}) =>
  e.catalogo.pacotes.length === 0 ? (
    <p className="vazio">Nenhum pacote na pasta templates/.</p>
  ) : e.estiloGaleria && e.estilo ? (
    <Galeria
      estilo={e.estiloGaleria}
      palette={e.estilo.palette}
      paletas={e.estilo.paletas}
      largura={e.videoInfo?.width ?? 1080}
      altura={e.videoInfo?.height ?? 1920}
      selecionado={e.selecionado}
      pacoteDoVideo={e.estilo.pacote}
      ocupado={e.ocupado || !e.projetoDoVideo}
      podeTrocarPacote={!e.ocupado}
      onAplicarLayout={e.aplicarLayoutDaGaleria}
      onAplicarPacote={e.trocarPacote}
      onSortear={e.sortearDeNovo}
      onLimparSelecao={() => e.setBlocoSelecionado(-1)}
    />
  ) : (
    <p className="vazio">Carregando templates...</p>
  );
