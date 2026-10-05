// Editor no celular: barra de cima, prévia, linha de tocar com a faixa de tempo, o
// conteúdo da aba ativa e as abas embaixo. A folha do bloco sobe por cima das abas.
import {useEffect, useState} from "react";
import {PREDEFINICOES, posicaoArrastada} from "../../../src/posicao";
import {abaGuardada, guardarAba} from "../Abas";
import {SelosDoBloco} from "../ListaDeBlocos";
import {Cores, Sons} from "../PainelEsquerdo";
import {PainelGeral} from "../PainelGeral";
import {Previa} from "../Previa";
import type {MoverLegenda} from "../Previa";
import {api} from "../api";
import {tempoDoBloco} from "../quadro";
import type {Editor} from "../useEditor";
import {Andamento} from "./Andamento";
import {AvisoDesfazer} from "./AvisoDesfazer";
import type {AvisoComDesfazer} from "./AvisoDesfazer";
import {AjustesDoBlocoCelular} from "./AjustesDoBlocoCelular";
import {FaixaDeTempo} from "./FaixaDeTempo";
import {Folha} from "./Folha";
import {GaleriaCelular} from "./GaleriaCelular";
import {ListaCelular} from "./ListaCelular";

const ABAS = [
  {valor: "legendas", nome: "Legendas", icone: "≡"},
  {valor: "templates", nome: "Templates", icone: "▦"},
  {valor: "cores", nome: "Cores", icone: "◐"},
  {valor: "sons", nome: "Sons", icone: "♪"},
  {valor: "ajustes", nome: "Ajustes", icone: "⚙"},
] as const;
type AbaCelular = (typeof ABAS)[number]["valor"];
const VALORES_DAS_ABAS = ABAS.map((aba) => aba.valor);

type Props = {
  e: Editor;
  folhaAberta: boolean;
  onAbrirFolha: () => void;
  onFecharFolha: () => void;
  onVoltar: () => void;
  onExportar: () => void;
};

export const EditorCelular: React.FC<Props> = ({e, folhaAberta, onAbrirFolha, onFecharFolha, onVoltar, onExportar}) => {
  const [aba, setAba] = useState<AbaCelular>(() => abaGuardada("abaCelular", VALORES_DAS_ABAS, "legendas"));
  const trocarAba = (nova: AbaCelular) => {
    setAba(nova);
    guardarAba("abaCelular", nova);
  };
  // "Mover legenda" da aba Ajustes: arrastar na prévia muda a posição geral.
  const [moverGeral, setMoverGeral] = useState(false);

  const {setGaleriaAberta, projetoDoVideo, estilo, blocos, video, videoInfo, blocoAcoes} = e;
  useEffect(() => setGaleriaAberta(aba === "templates"), [aba, setGaleriaAberta]);

  const indice = e.blocoSelecionado;
  const bloco = blocos[indice];
  const folhaVisivel = folhaAberta && Boolean(bloco) && Boolean(projetoDoVideo && estilo);

  // Tocar num bloco: a prévia vai até ele e a folha abre.
  const abrirBloco = (b: number) => {
    e.irParaBloco(b);
    onAbrirFolha();
  };

  // Excluir uma palavra (a última leva o bloco junto; tudo entra no desfazer) e
  // avisar com "Desfazer". Na folha, se o bloco saiu, a folha fecha.
  const [avisoDesfazer, setAvisoDesfazer] = useState<AvisoComDesfazer>();
  const excluirPalavra = (b: number, p: number, naFolha = false) => {
    const ultima = blocos[b]?.words.length === 1;
    blocoAcoes.excluirPalavra(b, p);
    setAvisoDesfazer({id: Date.now(), texto: ultima ? "Palavra e bloco excluídos" : "Palavra excluída"});
    if (ultima && naFolha) {
      onFecharFolha();
    }
  };

  // Com a folha aberta, arrastar a legenda move só aquele bloco; senão, com
  // "Mover legenda" ligado, move todas.
  const mover: MoverLegenda | undefined = !projetoDoVideo
    ? undefined
    : folhaVisivel && bloco
      ? {
          posicao: bloco.posicao ?? e.posicaoGeral,
          soUmBloco: true,
          onInicio: e.inicioDeAjuste,
          onMover: (p) => e.moverPosicao(indice, posicaoArrastada(p)),
        }
      : moverGeral
        ? {
            posicao: e.posicaoGeral,
            soUmBloco: false,
            onInicio: e.inicioDeAjuste,
            onMover: (p) => e.moverPosicao(-1, posicaoArrastada(p)),
          }
        : undefined;

  const naoTranscrito = (
    <div className="cel-vazio">
      <p className="vazio">{video ? "Este vídeo ainda não foi transcrito." : "Nenhum vídeo aberto."}</p>
      {video ? (
        <button type="button" className="bt primario cel-cheio" disabled={e.ocupado} onClick={() => void e.transcrever()}>
          Transcrever
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="cel-tela">
      <header className="cel-barra">
        <button type="button" className="cel-ic" aria-label="Voltar para os vídeos" onClick={onVoltar}>
          ‹
        </button>
        <span className="cel-nome">
          {video.replace(/\.[^.]+$/u, "") || "Nenhum vídeo"}
          {projetoDoVideo && e.salvamento !== "salvo" ? (
            <small className={e.salvamento === "erro" ? "projeto-erro" : undefined}>
              {e.salvamento === "erro" ? " · erro ao salvar" : " · salvando…"}
            </small>
          ) : null}
        </span>
        <button type="button" className="cel-ic" disabled={!e.podeDesfazer} aria-label="Desfazer" onClick={e.desfazer}>
          ↶
        </button>
        <button type="button" className="cel-ic" disabled={!e.podeRefazer} aria-label="Refazer" onClick={e.refazer}>
          ↷
        </button>
        <button type="button" className="cel-pilula" disabled={e.ocupado || !e.podeExportar} onClick={onExportar}>
          Exportar
        </button>
      </header>
      <Andamento tarefa={e.tarefa} />

      <div className="cel-palco">
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
            onQuadro={e.aoMudarQuadro}
            posicao={projetoDoVideo?.posicao}
            cortesMs={e.cortesMs}
            mover={mover}
          />
        ) : (
          <p className="vazio">{video ? "Carregando..." : ""}</p>
        )}
      </div>
      <FaixaDeTempo
        playerRef={e.playerRef}
        ativo={e.previaAtiva}
        fps={e.fps}
        durationInFrames={e.durationInFrames}
        blocos={blocos}
        timeline={e.timeline}
        blocoSelecionado={e.blocoSelecionado}
      />

      <div className="cel-corpo">
        <div className="cel-conteudo" role="tabpanel" id="cel-painel" aria-labelledby={`cel-aba-${aba}`}>
          {aba === "legendas" ? (
            projetoDoVideo && estilo ? (
              <>
                <p className="cel-ajuda">Toque na palavra para corrigir · ⋯ abre os ajustes do bloco</p>
                <ListaCelular
                  blocos={blocos}
                  timeline={e.timeline}
                  blocoAtivo={e.blocoAtivo}
                  blocoSelecionado={e.blocoSelecionado}
                  onIrPara={e.irParaBloco}
                  onAjustes={abrirBloco}
                  onTexto={blocoAcoes.texto}
                  onExcluirPalavra={excluirPalavra}
                />
              </>
            ) : (
              naoTranscrito
            )
          ) : null}
          {aba === "templates" ? <GaleriaCelular e={e} /> : null}
          {aba === "cores" ? (
            <Cores
              paletas={e.catalogo.paletas}
              paleta={estilo?.paleta ?? ""}
              coresDasPaletas={estilo?.paletas ?? {}}
              blocosComCor={blocos.filter((b) => b.paleta).length}
              ocupado={e.ocupado}
              onPaleta={e.trocarPaleta}
              onLimparCores={e.limparCores}
            />
          ) : null}
          {aba === "sons" ? (
            <Sons
              sons={e.sons}
              efeitos={e.configEfeitos}
              ocupado={e.ocupado}
              temProjeto={e.podeExportar}
              onEfeitos={e.mudarEfeitos}
              onOuvir={e.ouvirSom}
            />
          ) : null}
          {aba === "ajustes" ? (
            <>
              <button type="button" className="bt primario cel-cheio" disabled={e.ocupado || !video} onClick={() => void e.transcrever()}>
                Transcrever
              </button>
              <div className="titulo">Posição das legendas</div>
              <div className="seg cel-seg" role="group" aria-label="Posição das legendas">
                {PREDEFINICOES.map((predefinicao) => (
                  <button
                    key={predefinicao.nome}
                    type="button"
                    disabled={e.ocupado || !e.podeExportar}
                    aria-pressed={
                      e.posicaoGeral.x === predefinicao.posicao.x && e.posicaoGeral.y === predefinicao.posicao.y
                    }
                    onClick={() => e.editarProjeto({posicao: predefinicao.posicao})}
                  >
                    {predefinicao.nome}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="bt bt-ligado cel-cheio"
                aria-pressed={moverGeral}
                disabled={e.ocupado || !e.podeExportar}
                onClick={() => setMoverGeral(!moverGeral)}
              >
                {moverGeral ? "Mover legenda: arraste no vídeo" : "Mover legenda"}
              </button>
              <div className="titulo">Geral</div>
              <PainelGeral
                temProjeto={e.podeExportar}
                ocupado={e.ocupado}
                sincroniaMs={e.sincroniaMs}
                onSincronia={(valor) => e.atualizarProjeto({sincroniaMs: valor})}
                posicao={e.posicaoGeral}
                onInicioPosicao={e.inicioDeAjuste}
                onPosicao={(posicao) => e.atualizarProjeto({posicao})}
                excluidos={e.excluidos}
                onRestaurar={e.restaurarExcluido}
                blocosComPosicao={blocos.filter((b) => b.posicao).length}
                onRestaurarPosicoes={e.restaurarPosicoes}
                onRefazerLayouts={e.refazerTodosOsLayouts}
                onRecarregar={e.recarregarTemplates}
              />
              <div className="titulo">Vídeo</div>
              <div className="cel-pilha">
                <button type="button" className="bt cel-cheio" disabled={e.ocupado || !video || !e.podeExportar} onClick={e.recomecarDoZero}>
                  Recomeçar do zero
                </button>
                <button
                  type="button"
                  className="bt perigo cel-cheio"
                  disabled={e.ocupado || !video}
                  onClick={() => void e.removerVideo().then((saiu) => saiu && onVoltar())}
                >
                  Remover vídeo
                </button>
              </div>
            </>
          ) : null}
        </div>

        <nav className="cel-abas" role="tablist" aria-label="Seções do editor">
          {ABAS.map(({valor, nome, icone}) => (
            <button
              key={valor}
              type="button"
              role="tab"
              id={`cel-aba-${valor}`}
              aria-selected={aba === valor}
              aria-controls="cel-painel"
              className="cel-aba"
              onClick={() => trocarAba(valor)}
            >
              <i aria-hidden="true">{icone}</i>
              {nome}
            </button>
          ))}
        </nav>

        {folhaVisivel && bloco && estilo && projetoDoVideo ? (
          <Folha
            // A prévia (arrastar a legenda), a barra acima do teclado e o aviso com
            // Desfazer ficam fora da folha, mas tocar neles não a fecha.
            ignorarFora=".previa, .cel-barra-teclado, .cel-aviso-desfazer"
            onFechar={onFecharFolha}
            titulo={
              <span className="cab">
                <b>Bloco #{indice + 1}</b>
                <span>{tempoDoBloco(e.timeline[indice]?.showMs ?? bloco.startMs)}</span>
                <SelosDoBloco bloco={bloco} />
                <span className={`selo selo-layout ${bloco.family === "destaque" ? "selo-destaque" : ""}`}>{bloco.template}</span>
              </span>
            }
          >
            <p className="cel-ajuda">Toque na palavra para corrigir · arraste a legenda no vídeo para mover só este bloco</p>
            <AjustesDoBlocoCelular
              indice={indice}
              blocos={blocos}
              timeline={e.timeline}
              estilo={estilo}
              sons={e.sons}
              efeitos={e.efeitos}
              posicaoGeral={e.posicaoGeral}
              soEsteBloco={false}
              mostrarSoEsteBloco={false}
              ocupado={e.ocupado}
              onSoEsteBloco={() => undefined}
              onTexto={blocoAcoes.texto}
              onPalavraChave={blocoAcoes.palavraChave}
              onExcluirPalavra={(b, p) => excluirPalavra(b, p, true)}
              onDividir={blocoAcoes.dividir}
              onLayout={blocoAcoes.layout}
              onCor={blocoAcoes.cor}
              onSom={blocoAcoes.som}
              onOuvir={e.ouvirSom}
              onPosicaoGeral={blocoAcoes.posicaoGeral}
              onInicioPosicao={e.inicioDeAjuste}
              onPosicaoDoBloco={blocoAcoes.posicaoDoBloco}
              onJuntar={blocoAcoes.juntar}
              onRevisar={blocoAcoes.revisar}
              onExcluirBloco={(b) => {
                blocoAcoes.excluirBloco(b);
                onFecharFolha();
              }}
            />
          </Folha>
        ) : null}
      </div>
      <AvisoDesfazer
        aviso={avisoDesfazer}
        blocos={blocos}
        onDesfazer={e.desfazer}
        onFechar={() => setAvisoDesfazer(undefined)}
      />
    </div>
  );
};
