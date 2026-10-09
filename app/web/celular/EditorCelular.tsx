// Editor no celular: barra de cima, prévia, linha de tocar com a faixa de tempo, o
// conteúdo da aba ativa e as abas embaixo. A folha do bloco sobe por cima das abas.
import {useEffect, useState} from "react";
import {PREDEFINICOES, posicaoArrastada} from "../../../src/posicao";
import {PACOTE_MISTO} from "../../../src/motor/blocos";
import {abaGuardada, guardarAba} from "../Abas";
import {SelosDoBloco} from "../ListaDeBlocos";
import {PainelGeral} from "../PainelGeral";
import {Previa} from "../Previa";
import {api, tituloDoVideo} from "../api";
import {tempoDoBloco} from "../quadro";
import type {Editor} from "../useEditor";
import {Andamento} from "./Andamento";
import {AvisoDesfazer} from "./AvisoDesfazer";
import {CoresCelular} from "./CoresCelular";
import type {AvisoComDesfazer} from "./AvisoDesfazer";
import {AjustesDoBlocoCelular} from "./AjustesDoBlocoCelular";
import {ArrastoCelular} from "./ArrastoCelular";
import {Dica, marcarDica} from "./Dica";
import {FaixaDeTempo} from "./FaixaDeTempo";
import {Folha} from "./Folha";
import {GaleriaCelular} from "./GaleriaCelular";
import {ListaCelular} from "./ListaCelular";
import {PreparandoPrevia} from "../PreparandoPrevia";
import {SonsCelular} from "./SonsCelular";

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
  const {setGaleriaAberta, projetoDoVideo, estilo, blocos, video, videoInfo, blocoAcoes} = e;
  useEffect(() => setGaleriaAberta(aba === "templates"), [aba, setGaleriaAberta]);

  const indice = e.blocoSelecionado;
  const bloco = blocos[indice];
  const folhaVisivel = folhaAberta && Boolean(bloco) && Boolean(projetoDoVideo && estilo);

  // Tocar num bloco: a prévia vai até ele e a folha abre.
  const abrirBloco = (b: number) => {
    e.irParaBloco(b);
    onAbrirFolha();
    marcarDica("legendas");
  };

  // Excluir uma palavra (a última leva o bloco junto; tudo entra no desfazer) e
  // avisar com "Desfazer". Na folha, se o bloco saiu, a folha fecha.
  const [avisoDesfazer, setAvisoDesfazer] = useState<AvisoComDesfazer>();

  // Tela cheia: a prévia cobre a tela toda (feita no próprio app; o iPhone não põe
  // em tela cheia nada além de um <video>). Esc também sai.
  const [telaCheia, setTelaCheia] = useState(false);
  useEffect(() => {
    if (!telaCheia) {
      return;
    }
    const aoTeclar = (event: KeyboardEvent) => event.key === "Escape" && setTelaCheia(false);
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [telaCheia]);
  const excluirPalavra = (b: number, p: number, naFolha = false) => {
    const ultima = blocos[b]?.words.length === 1;
    blocoAcoes.excluirPalavra(b, p);
    setAvisoDesfazer({id: Date.now(), texto: ultima ? "Palavra e bloco excluídos" : "Palavra excluída"});
    if (ultima && naFolha) {
      onFecharFolha();
    }
  };

  // Arrastar a legenda na prévia move o que está na tela: com a folha aberta, o
  // bloco dela; sem a folha, o bloco tocando se ele tem posição própria, senão a
  // posição geral (todas as legendas). -1 é a geral.
  const blocoNaTela = blocos[e.blocoAtivo];
  const alvoDoArrasto = folhaVisivel ? indice : blocoNaTela?.posicao ? e.blocoAtivo : -1;
  const posicaoDoArrasto = blocos[alvoDoArrasto]?.posicao ?? e.posicaoGeral;
  const rotuloDoArrasto = alvoDoArrasto < 0 ? "Todas as legendas" : `Bloco #${alvoDoArrasto + 1}`;

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
    <div className={`cel-tela cel-editor ${folhaVisivel ? "cel-com-folha" : ""} ${telaCheia ? "cel-em-tela-cheia" : ""}`}>
      <header className="cel-barra">
        <button type="button" className="cel-ic" aria-label="Voltar para os vídeos" onClick={onVoltar}>
          ‹
        </button>
        <span className="cel-nome">
          {video ? tituloDoVideo(e.catalogo, video) : "Nenhum vídeo"}
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
        {video && videoInfo && estilo && e.videoUrlDaPrevia ? (
          <>
            <Previa
              ref={e.playerRef}
              videoUrl={e.videoUrlDaPrevia}
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
              entradaLinear={projetoDoVideo?.entradaLinear}
            />
            {projetoDoVideo ? (
              <ArrastoCelular
                proporcao={videoInfo.width / videoInfo.height}
                posicao={posicaoDoArrasto}
                rotulo={rotuloDoArrasto}
                marcada={folhaVisivel}
                onInicio={() => {
                  e.inicioDeAjuste();
                  marcarDica("arrastar");
                }}
                onMover={(p) => e.moverPosicao(alvoDoArrasto, posicaoArrastada(p))}
                onToque={() => e.playerRef.current?.toggle()}
              />
            ) : null}
            {telaCheia ? (
              <div className="cel-tela-cheia-controles">
                <FaixaDeTempo
                  playerRef={e.playerRef}
                  ativo={e.previaAtiva}
                  fps={e.fps}
                  durationInFrames={e.durationInFrames}
                  blocos={blocos}
                  timeline={e.timeline}
                  blocoSelecionado={e.blocoSelecionado}
                />
                <button type="button" className="cel-ic cel-ic-forte" aria-label="Sair da tela cheia" onClick={() => setTelaCheia(false)}>
                  ✕
                </button>
              </div>
            ) : (
              <button type="button" className="cel-bt-tela-cheia" aria-label="Tela cheia" onClick={() => setTelaCheia(true)}>
                ⛶
              </button>
            )}
          </>
        ) : video && videoInfo && e.previaLeve.estado ? (
          <PreparandoPrevia
            estado={e.previaLeve.estado}
            proporcao={videoInfo.width / videoInfo.height}
            onTentarDeNovo={e.previaLeve.tentarDeNovo}
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
        <div
          className="cel-conteudo"
          role="tabpanel"
          id="cel-painel"
          aria-labelledby={`cel-aba-${aba}`}
          // Primeira palavra editada na lista: a dica da aba Legendas já cumpriu o papel.
          onFocus={(event) => aba === "legendas" && event.target instanceof HTMLInputElement && marcarDica("legendas")}
        >
          {aba === "legendas" ? (
            projetoDoVideo && estilo ? (
              <>
                <Dica nome="legendas">Toque na palavra para corrigir · ⋯ ajusta o bloco · arraste a legenda no vídeo</Dica>
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
          {aba === "cores" ? <CoresCelular e={e} /> : null}
          {aba === "sons" ? <SonsCelular e={e} /> : null}
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
              <div className="titulo">Geral</div>
              <PainelGeral
                temProjeto={e.podeExportar}
                ocupado={e.ocupado}
                sincroniaMs={e.sincroniaMs}
                onSincronia={(valor) => e.atualizarProjeto({sincroniaMs: valor})}
                sincroniaPrecisa={e.sincroniaPrecisa}
                detectandoVoz={e.detectandoVoz}
                onSincroniaPrecisa={e.alternarSincroniaPrecisa}
                mostrarEntradaLinear={estilo?.pacote === "c" || estilo?.pacote === PACOTE_MISTO}
                entradaLinear={projetoDoVideo?.entradaLinear ?? "palavra"}
                onEntradaLinear={(entradaLinear) => e.atualizarProjeto({entradaLinear})}
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
            // A prévia (com a alça de arrastar a legenda e a tela cheia), a barra acima
            // do teclado e o aviso com Desfazer ficam fora da folha, mas tocar neles
            // não a fecha.
            ignorarFora=".cel-palco, .cel-barra-teclado, .cel-aviso-desfazer"
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
            <Dica nome="arrastar">Arraste a legenda no vídeo para mover só este bloco</Dica>
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
