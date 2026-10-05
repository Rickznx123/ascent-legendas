// Linha do transporte: tocar/pausar, o tempo e a faixa fina com os blocos. Tocar ou
// arrastar na faixa leva a prévia até ali.
import {useRef} from "react";
import type {PlayerRef} from "@remotion/player";
import type {BlockTiming} from "../../../src/tempos";
import type {AssignedCaptionBlock} from "../../../src/types";
import {relogio, useQuadroDaPrevia} from "../quadro";

type Props = {
  playerRef: React.RefObject<PlayerRef | null>;
  ativo: boolean;
  fps: number;
  durationInFrames: number;
  blocos: AssignedCaptionBlock[];
  timeline: BlockTiming[];
  blocoSelecionado: number;
};

export const FaixaDeTempo: React.FC<Props> = ({playerRef, ativo, fps, durationInFrames, blocos, timeline, blocoSelecionado}) => {
  const {quadro, tocando} = useQuadroDaPrevia(playerRef, ativo);
  const faixa = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const totalMs = Math.max(1, (durationInFrames / fps) * 1000);
  const porcento = (ms: number) => `${(Math.max(0, Math.min(ms, totalMs)) / totalMs) * 100}%`;

  const irPara = (clientX: number) => {
    const caixa = faixa.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0) {
      return;
    }
    const fracao = Math.max(0, Math.min(1, (clientX - caixa.left) / caixa.width));
    playerRef.current?.seekTo(Math.min(durationInFrames - 1, Math.round(fracao * durationInFrames)));
  };

  return (
    <div className="cel-transporte">
      <button
        type="button"
        className="cel-ic cel-ic-forte"
        disabled={!ativo}
        aria-label={tocando ? "Pausar" : "Reproduzir"}
        onClick={() => playerRef.current?.toggle()}
      >
        {tocando ? "❚❚" : "▶"}
      </button>
      <span className="relogio">
        <b>{relogio((quadro / fps) * 1000)}</b> / {relogio(totalMs)}
      </span>
      <div
        ref={faixa}
        className="cel-faixa"
        role="slider"
        tabIndex={ativo ? 0 : -1}
        aria-label="Posição da prévia"
        aria-valuemin={0}
        aria-valuemax={Math.round(totalMs / 1000)}
        aria-valuenow={Math.round(quadro / fps)}
        aria-valuetext={relogio((quadro / fps) * 1000)}
        onPointerDown={(event) => {
          if (!ativo) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          arrastando.current = true;
          playerRef.current?.pause();
          irPara(event.clientX);
        }}
        onPointerMove={(event) => arrastando.current && irPara(event.clientX)}
        onPointerUp={() => (arrastando.current = false)}
        onPointerCancel={() => (arrastando.current = false)}
      >
        {blocos.map((bloco, indice) => {
          const tempo = timeline[indice];
          return tempo ? (
            <i
              key={`${bloco.startMs}-${indice}`}
              className={[
                bloco.family === "destaque" ? "cel-faixa-destaque" : "",
                indice === blocoSelecionado ? "cel-faixa-selecionado" : "",
              ].join(" ")}
              style={{left: porcento(tempo.showMs), width: `max(2px, ${porcento(tempo.hideMs - tempo.showMs)})`}}
            />
          ) : null;
        })}
        {ativo ? <span className="cel-agulha" style={{left: `${(quadro / Math.max(1, durationInFrames)) * 100}%`}} /> : null}
      </div>
    </div>
  );
};
