// Layout de computador: barra, três colunas (biblioteca, prévia, legendas) e a
// linha do tempo embaixo. O estado e as funções vêm de useEditor.
import {useEffect, useState} from "react";
import {AvisoDoPlano} from "./AvisoDoPlano";
import {posicaoArrastada} from "../../src/posicao";
import {Abas, PainelDaAba, abaGuardada, guardarAba} from "./Abas";
import type {Aba} from "./Abas";
import {AjustesDoBloco} from "./AjustesDoBloco";
import {Avisos} from "./Avisos";
import {BarraTopo} from "./BarraTopo";
import {Controles} from "./Controles";
import {GaleriaDoProjeto} from "./GaleriaDoProjeto";
import {LinhaDoTempo} from "./LinhaDoTempo";
import {ListaDeBlocos} from "./ListaDeBlocos";
import {PainelEsquerdo, ABAS_ESQUERDA} from "./PainelEsquerdo";
import type {AbaEsquerda} from "./PainelEsquerdo";
import {PainelGeral} from "./PainelGeral";
import {Previa} from "./Previa";
import {api} from "./api";
import {plataforma} from "./plataforma";
import type {Editor} from "./useEditor";

const ABAS_DIREITA = ["legendas", "ajustes", "geral"] as const;
type AbaDireita = (typeof ABAS_DIREITA)[number];
const ABAS_DO_PAINEL_DIREITO: Aba<AbaDireita>[] = [
  {valor: "legendas", nome: "Legendas"},
  {valor: "ajustes", nome: "Ajustes do bloco"},
  {valor: "geral", nome: "Geral"},
];

export const LayoutComputador: React.FC<{e: Editor}> = ({e}) => {
  const [arrastando, setArrastando] = useState(false);
  // Abas dos painéis (lembradas neste navegador) e, em janela estreita, painéis
  // laterais recolhidos.
  const [abaEsquerda, setAbaEsquerda] = useState<AbaEsquerda>(() => abaGuardada("abaEsquerda", ABAS_ESQUERDA, "templates"));
  const [abaDireita, setAbaDireita] = useState<AbaDireita>(() => abaGuardada("abaDireita", ABAS_DIREITA, "legendas"));
  const trocarAbaEsquerda = (aba: AbaEsquerda) => {
    setAbaEsquerda(aba);
    guardarAba("abaEsquerda", aba);
  };
  const trocarAbaDireita = (aba: AbaDireita) => {
    setAbaDireita(aba);
    guardarAba("abaDireita", aba);
  };
  const [esqAberto, setEsqAberto] = useState(true);
  const [dirAberto, setDirAberto] = useState(true);

  // A galeria carrega o estilo com todos os pacotes quando aparece.
  const {setGaleriaAberta} = e;
  useEffect(() => setGaleriaAberta(abaEsquerda === "templates"), [abaEsquerda, setGaleriaAberta]);

  const soltarArquivo = (event: React.DragEvent) => {
    event.preventDefault();
    setArrastando(false);
    const arquivo = event.dataTransfer.files[0];
    if (!arquivo || e.tarefa) {
      return;
    }
    const escolhido = plataforma.videoArrastado(arquivo);
    if (escolhido) {
      void e.importarVideo(escolhido);
    } else {
      e.setErro("Arraste um vídeo .mp4, .mov, .mkv ou .webm.");
    }
  };

  const {projetoDoVideo, estilo, blocos, video, videoInfo, blocoAcoes} = e;

  return (
    <div
      className={["app", arrastando ? "app-arrastando" : "", esqAberto ? "" : "sem-esq", dirAberto ? "" : "sem-dir"].join(" ")}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setArrastando(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target || !event.relatedTarget) {
          setArrastando(false);
        }
      }}
      onDrop={soltarArquivo}
    >
      <BarraTopo
        video={video}
        temProjeto={Boolean(projetoDoVideo)}
        salvamento={e.salvamento}
        ocupado={e.ocupado}
        podeExportar={e.podeExportar}
        tarefa={e.tarefa}
        podeDesfazer={e.podeDesfazer}
        podeRefazer={e.podeRefazer}
        onDesfazer={e.desfazer}
        onRefazer={e.refazer}
        onTranscrever={() => void e.transcrever()}
        // Com plano: primeiro o aviso do que vai descontar (AvisoDoPlano, abaixo).
        onExportar={e.comPlano ? () => void e.prepararExportacao() : e.exportar}
        exportado={e.exportado?.nome}
        onBaixar={() => e.exportado && plataforma.baixarExportado(e.exportado.nome)}
        onAbrirPasta={() => plataforma.abrirPastaDeSaidas().catch(e.mostrarErro)}
        onFecharExportado={() => e.setExportado(undefined)}
        esqAberto={esqAberto}
        dirAberto={dirAberto}
        onAlternarEsq={() => setEsqAberto(!esqAberto)}
        onAlternarDir={() => setDirAberto(!dirAberto)}
      />

      <PainelEsquerdo
        aba={abaEsquerda}
        onAba={trocarAbaEsquerda}
        ocupado={e.ocupado}
        temProjeto={e.podeExportar}
        videos={e.catalogo.videos}
        video={video}
        duracaoMs={videoInfo ? (videoInfo.durationInFrames / videoInfo.fps) * 1000 : undefined}
        quantosBlocos={projetoDoVideo ? blocos.length : undefined}
        arrastando={arrastando}
        onImportar={() => void e.escolherEImportar()}
        onVideo={e.setVideo}
        onRecomecar={e.recomecarDoZero}
        onRemoverVideo={() => void e.removerVideo()}
        galeria={<GaleriaDoProjeto e={e} />}
        paletas={e.catalogo.paletas}
        paleta={estilo?.paleta ?? ""}
        coresDasPaletas={estilo?.paletas ?? {}}
        blocosComCor={blocos.filter((bloco) => bloco.paleta).length}
        onPaleta={e.trocarPaleta}
        onLimparCores={e.limparCores}
        sons={e.sons}
        efeitos={e.configEfeitos}
        onEfeitos={e.mudarEfeitos}
        onOuvir={e.ouvirSom}
      />

      <section className="centro" aria-label="Prévia">
        <div className="palco">
          {video && videoInfo && estilo ? (
            <Previa
              ref={e.playerRef}
              videoUrl={api.videoUrl(video)}
              video={videoInfo}
              blocos={blocos}
              estilo={estilo}
              efeitos={e.efeitos}
              volumeEfeitos={e.configEfeitos.volume}
              sonsUrl={api.sonsUrl}
              sincroniaMs={e.sincroniaMs}
              precisa={e.precisa}
              marcaDagua={e.marcaDagua}
              onQuadro={e.aoMudarQuadro}
              posicao={projetoDoVideo?.posicao}
              cortesMs={e.cortesMs}
              mover={
                e.moverLegenda && projetoDoVideo
                  ? {
                      posicao: e.posicaoQueMove,
                      soUmBloco: e.blocoQueMove >= 0,
                      onInicio: () => e.guardarNoHistorico(projetoDoVideo),
                      onMover: (p) => e.moverPara(posicaoArrastada(p)),
                    }
                  : undefined
              }
            />
          ) : (
            <p className="vazio">
              {e.catalogo.videos.length === 0
                ? "Clique em Importar vídeo (aba Mídia) ou arraste um vídeo para a janela."
                : "Carregando..."}
            </p>
          )}
        </div>
        <Controles
          playerRef={e.playerRef}
          ativo={e.previaAtiva}
          fps={e.fps}
          durationInFrames={e.durationInFrames}
          posicao={e.posicaoGeral}
          moverLegenda={e.moverLegenda}
          soEsteBloco={e.soEsteBloco}
          temBlocoSelecionado={e.temBlocoSelecionado}
          desativado={e.ocupado || !e.podeExportar}
          ocupado={e.ocupado}
          onPredefinicao={(p) => e.editarProjeto({posicao: p})}
          onMoverLegenda={e.setMoverLegenda}
          onSoEsteBloco={e.marcarSoEsteBloco}
        />
      </section>

      <aside className="dir" aria-label="Legendas e ajustes">
        <Abas id="dir" rotulo="Legendas e ajustes" abas={ABAS_DO_PAINEL_DIREITO} atual={abaDireita} onTrocar={trocarAbaDireita} />
        <PainelDaAba id="dir" atual={abaDireita}>
          {abaDireita !== "geral" && (!projetoDoVideo || !estilo) ? (
            <p className="vazio">{video ? "Este vídeo ainda não foi transcrito. Clique em Transcrever." : ""}</p>
          ) : null}
          {abaDireita === "legendas" && projetoDoVideo && estilo ? (
            <ListaDeBlocos
              blocos={blocos}
              timeline={e.timeline}
              blocoAtivo={e.blocoAtivo}
              blocoSelecionado={e.blocoSelecionado}
              onIrPara={e.irParaBloco}
              onTexto={blocoAcoes.texto}
              onPalavraChave={blocoAcoes.palavraChave}
              onExcluirPalavra={blocoAcoes.excluirPalavra}
            />
          ) : null}
          {abaDireita === "ajustes" && projetoDoVideo && estilo ? (
            <AjustesDoBloco
              indice={e.blocoSelecionado}
              blocos={blocos}
              timeline={e.timeline}
              estilo={estilo}
              sons={e.sons}
              efeitos={e.efeitos}
              posicaoGeral={e.posicaoGeral}
              soEsteBloco={e.soEsteBloco}
              ocupado={e.ocupado}
              onSoEsteBloco={e.marcarSoEsteBloco}
              onTexto={blocoAcoes.texto}
              onPalavraChave={blocoAcoes.palavraChave}
              onExcluirPalavra={blocoAcoes.excluirPalavra}
              onDividir={blocoAcoes.dividir}
              onLayout={blocoAcoes.layout}
              onCor={blocoAcoes.cor}
              onSom={blocoAcoes.som}
              onOuvir={e.ouvirSom}
              onPosicaoGeral={blocoAcoes.posicaoGeral}
              onInicioPosicao={() => e.guardarNoHistorico(projetoDoVideo)}
              onPosicaoDoBloco={blocoAcoes.posicaoDoBloco}
              onJuntar={blocoAcoes.juntar}
              onRevisar={blocoAcoes.revisar}
              onExcluirBloco={blocoAcoes.excluirBloco}
            />
          ) : null}
          {abaDireita === "geral" ? (
            <PainelGeral
              temProjeto={e.podeExportar}
              ocupado={e.ocupado}
              sincroniaMs={e.sincroniaMs}
              onSincronia={(valor) => e.atualizarProjeto({sincroniaMs: valor})}
              sincroniaPrecisa={e.sincroniaPrecisa}
              detectandoVoz={e.detectandoVoz}
              onSincroniaPrecisa={e.alternarSincroniaPrecisa}
              posicao={e.posicaoGeral}
              onInicioPosicao={e.inicioDeAjuste}
              onPosicao={(posicao) => e.atualizarProjeto({posicao})}
              excluidos={e.excluidos}
              onRestaurar={e.restaurarExcluido}
              blocosComPosicao={blocos.filter((bloco) => bloco.posicao).length}
              onRestaurarPosicoes={e.restaurarPosicoes}
              onRefazerLayouts={e.refazerTodosOsLayouts}
              onRecarregar={e.recarregarTemplates}
            />
          ) : null}
        </PainelDaAba>
      </aside>

      <LinhaDoTempo
        playerRef={e.playerRef}
        ativo={e.previaAtiva}
        fps={e.fps}
        durationInFrames={e.durationInFrames}
        video={video}
        blocos={blocos}
        timeline={e.timeline}
        efeitos={e.efeitos}
        blocoSelecionado={e.blocoSelecionado}
        onSelecionar={e.irParaBloco}
      />

      <Avisos avisos={e.avisos} erro={e.erro} onFecharAviso={e.fecharAviso} onFecharErro={() => e.setErro(undefined)} />
      {e.previaExportacao && !e.ocupado ? (
        <div className="janela-fundo" role="dialog" aria-modal="true" aria-label="Exportar">
          <div className="janela-plano">
            <h2>Exportar</h2>
            <AvisoDoPlano
              decisao={e.previaExportacao}
              ocupado={e.ocupado || !e.podeExportar}
              onExportar={() => {
                e.fecharPreviaExportacao();
                void e.exportar();
              }}
              onVoltar={e.fecharPreviaExportacao}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
