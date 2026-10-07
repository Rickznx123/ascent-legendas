import {forwardRef, useEffect, useMemo, useRef, useState} from "react";
import {Player} from "@remotion/player";
import type {PlayerRef} from "@remotion/player";
import {KineticCaptionVideo} from "../../src/KineticCaptionVideo";
import type {Estilo} from "../../src/motor/projeto";
import {MARGEM_SEGURA} from "../../src/posicao";
import type {Posicao} from "../../src/posicao";
import type {AssignedCaptionBlock, EfeitoSonoro, EntradaLinear, KineticCaptionVideoProps, SincroniaPrecisa, VideoMetadata} from "../../src/types";

// "Mover legenda": arrastar na prévia muda a posição (a geral ou a de um bloco).
export type MoverLegenda = {
  // Posição que o arrasto está mudando (centro do bloco, em %).
  posicao: Posicao;
  soUmBloco: boolean;
  // Começo do arrasto (entra no histórico de desfazer uma vez só).
  onInicio: () => void;
  onMover: (posicao: Posicao) => void;
};

type Props = {
  videoUrl: string;
  video: VideoMetadata;
  blocos: AssignedCaptionBlock[];
  estilo: Estilo;
  // Os mesmos efeitos sonoros do render.
  efeitos: EfeitoSonoro[];
  volumeEfeitos: number;
  sonsUrl: string;
  sincroniaMs: number;
  precisa?: SincroniaPrecisa;
  // Marca d'água do plano grátis: só para mostrar o que vai sair (quem decide no
  // vídeo exportado é o servidor).
  marcaDagua?: boolean;
  // Posição geral e instantes dos blocos excluídos, como no render.
  posicao?: Posicao;
  cortesMs: number[];
  // Entrada dos lineares que aceitam letra por letra (pacote C).
  entradaLinear?: EntradaLinear;
  mover?: MoverLegenda;
  onQuadro: (frame: number) => void;
};

// Camada por cima da prévia para arrastar a legenda, com as guias de centro e de
// margem segura. Os controles ficam fora da prévia (embaixo dela).
const CamadaDeArrasto: React.FC<{mover: MoverLegenda}> = ({mover}) => {
  const camada = useRef<HTMLDivElement>(null);
  const inicio = useRef<{x: number; y: number; posicao: Posicao} | undefined>(undefined);
  const [arrastando, setArrastando] = useState(false);
  const {posicao} = mover;
  const soltar = () => {
    inicio.current = undefined;
    setArrastando(false);
  };
  return (
    // Guias e arrasto na área toda do vídeo.
    <div ref={camada} className={`arrasto ${arrastando ? "arrasto-ativo" : ""}`}>
      <div
        className="arrasto-area"
        role="application"
        aria-label={mover.soUmBloco ? "Arraste para mover só o bloco selecionado" : "Arraste para mover todas as legendas"}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          // Sem seleção de texto nem arrasto nativo do navegador no meio do caminho.
          event.preventDefault();
          inicio.current = {x: event.clientX, y: event.clientY, posicao};
          setArrastando(true);
          mover.onInicio();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Sem captura o arrasto continua enquanto o ponteiro estiver sobre a prévia.
          }
        }}
        onPointerMove={(event) => {
          const caixa = camada.current?.getBoundingClientRect();
          if (!inicio.current || !caixa) {
            return;
          }
          // O "soltar" se perdeu (botão solto fora da janela, janela coberta): o
          // arrasto acaba aqui, em vez de seguir o mouse sem botão apertado.
          if (event.pointerType === "mouse" && event.buttons === 0) {
            soltar();
            return;
          }
          mover.onMover({
            x: inicio.current.posicao.x + ((event.clientX - inicio.current.x) / caixa.width) * 100,
            y: inicio.current.posicao.y + ((event.clientY - inicio.current.y) / caixa.height) * 100,
          });
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onLostPointerCapture={soltar}
      />
      {/* Margem segura e guias de centro. */}
      <div
        className="guia-margem"
        style={{
          left: `${MARGEM_SEGURA.xMin}%`,
          right: `${100 - MARGEM_SEGURA.xMax}%`,
          top: `${MARGEM_SEGURA.yMin}%`,
          bottom: `${100 - MARGEM_SEGURA.yMax}%`,
        }}
      />
      <div className={`guia-vertical ${posicao.x === 50 ? "guia-encaixada" : ""}`} />
      <div className="guia-horizontal" />
      <div className="marcador-posicao" style={{left: `${posicao.x}%`, top: `${posicao.y}%`}} />
      <span className="arrasto-legenda">
        {mover.soUmBloco ? "Só este bloco" : "Todas as legendas"} · {posicao.x}% × {posicao.y}%
      </span>
    </div>
  );
};

// Prévia ao vivo: o mesmo componente da renderização, dentro do Remotion Player.
export const Previa = forwardRef<PlayerRef, Props>((props, ref) => {
  const {videoUrl, video, blocos, estilo, efeitos, volumeEfeitos, sonsUrl, sincroniaMs, precisa, marcaDagua, posicao, cortesMs, entradaLinear, mover, onQuadro} =
    props;
  const inputProps: KineticCaptionVideoProps = useMemo(
    () => ({
      videoSrc: videoUrl,
      blocks: blocos,
      templates: estilo.templates,
      palette: estilo.palette,
      palettes: estilo.paletas,
      video,
      efeitos,
      volumeEfeitos,
      sonsUrl,
      sincroniaMs,
      precisa,
      posicao,
      cortesMs,
      marcaDagua,
      entradaLinear,
    }),
    [videoUrl, blocos, estilo, video, efeitos, volumeEfeitos, sonsUrl, sincroniaMs, precisa, posicao, cortesMs, marcaDagua, entradaLinear],
  );

  // Os controles ficam embaixo da prévia; em tela cheia, os do próprio Player.
  const [telaCheia, setTelaCheia] = useState(false);
  useEffect(() => {
    const player = typeof ref === "object" ? ref?.current : null;
    if (!player) {
      return;
    }
    const listener = ({detail}: {detail: {isFullscreen: boolean}}) => setTelaCheia(detail.isFullscreen);
    player.addEventListener("fullscreenchange", listener);
    return () => player.removeEventListener("fullscreenchange", listener);
  }, [ref]);

  // Link direto para um momento: ?t=1.2 abre a prévia em 1,2 s.
  useEffect(() => {
    const player = typeof ref === "object" ? ref?.current : null;
    const segundos = Number(new URLSearchParams(window.location.search).get("t"));
    if (player && Number.isFinite(segundos) && segundos > 0) {
      player.seekTo(Math.round(segundos * video.fps));
    }
  }, [ref, video.fps]);

  useEffect(() => {
    const player = typeof ref === "object" ? ref?.current : null;
    if (!player) {
      return;
    }
    const listener = ({detail}: {detail: {frame: number}}) => onQuadro(detail.frame);
    player.addEventListener("frameupdate", listener);
    player.addEventListener("seeked", listener);
    return () => {
      player.removeEventListener("frameupdate", listener);
      player.removeEventListener("seeked", listener);
    };
  }, [ref, onQuadro]);

  return (
    // A prévia (e a camada de arrastar por cima) tem exatamente a proporção do vídeo.
    <div
      className="previa"
      style={{aspectRatio: `${video.width} / ${video.height}`, ["--proporcao" as string]: video.width / video.height}}
    >
      <Player
        ref={ref}
        component={KineticCaptionVideo}
        inputProps={inputProps}
        durationInFrames={video.durationInFrames}
        compositionWidth={video.width}
        compositionHeight={video.height}
        fps={video.fps}
        controls={telaCheia}
        clickToPlay
        style={{width: "100%", height: "100%"}}
      />
      {mover ? <CamadaDeArrasto mover={mover} /> : null}
    </div>
  );
});

Previa.displayName = "Previa";
