import type {PlayerRef} from "@remotion/player";
import {PREDEFINICOES} from "../../src/posicao";
import type {Posicao} from "../../src/posicao";
import {relogio, useQuadroDaPrevia} from "./quadro";

type Props = {
  playerRef: React.RefObject<PlayerRef | null>;
  // A prévia está na tela.
  ativo: boolean;
  fps: number;
  durationInFrames: number;
  // Posição das legendas: geral (predefinições), arrastar na prévia, só um bloco.
  posicao: Posicao;
  moverLegenda: boolean;
  soEsteBloco: boolean;
  temBlocoSelecionado: boolean;
  // Sem projeto ou com tarefa rodando.
  desativado: boolean;
  ocupado: boolean;
  onPredefinicao: (posicao: Posicao) => void;
  onMoverLegenda: (ligado: boolean) => void;
  onSoEsteBloco: (ligado: boolean) => void;
};

export const Controles: React.FC<Props> = ({
  playerRef,
  ativo,
  fps,
  durationInFrames,
  posicao,
  moverLegenda,
  soEsteBloco,
  temBlocoSelecionado,
  desativado,
  ocupado,
  onPredefinicao,
  onMoverLegenda,
  onSoEsteBloco,
}) => {
  const {quadro, tocando, mudo} = useQuadroDaPrevia(playerRef, ativo);
  const player = () => playerRef.current;
  return (
    <div className="controles">
      <button
        type="button"
        className="ic ic-forte"
        disabled={!ativo}
        aria-label={tocando ? "Pausar" : "Reproduzir"}
        title={tocando ? "Pausar" : "Reproduzir"}
        onClick={() => player()?.toggle()}
      >
        {tocando ? "❚❚" : "▶"}
      </button>
      <button
        type="button"
        className="ic"
        disabled={!ativo}
        aria-pressed={mudo}
        aria-label={mudo ? "Ligar o som" : "Tirar o som"}
        title={mudo ? "Ligar o som" : "Tirar o som"}
        onClick={() => (mudo ? player()?.unmute() : player()?.mute())}
      >
        {mudo ? "🔇" : "🔊"}
      </button>
      <span className="relogio">
        <b>{relogio((quadro / fps) * 1000)}</b> / {relogio((durationInFrames / fps) * 1000)}
      </span>
      <div className="cresce" />
      <span className="suave controles-rotulo" title={`Posição geral: ${posicao.x}% × ${posicao.y}%`}>
        Posição
      </span>
      <div className="seg" role="group" aria-label="Posição das legendas">
        {PREDEFINICOES.map((predefinicao) => (
          <button
            key={predefinicao.nome}
            type="button"
            disabled={desativado}
            aria-pressed={posicao.x === predefinicao.posicao.x && posicao.y === predefinicao.posicao.y}
            onClick={() => onPredefinicao(predefinicao.posicao)}
          >
            {predefinicao.nome}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="bt bt-ligado"
        aria-pressed={moverLegenda}
        disabled={desativado}
        title={moverLegenda ? "Ligado: arraste a legenda na prévia (clique para desligar)" : "Arraste a legenda na prévia"}
        onClick={() => onMoverLegenda(!moverLegenda)}
      >
        Mover legenda
      </button>
      {moverLegenda ? (
        <label className="so-este-bloco" title={temBlocoSelecionado ? undefined : "Clique num bloco da lista primeiro"}>
          <input
            type="checkbox"
            checked={soEsteBloco}
            disabled={ocupado || !temBlocoSelecionado}
            onChange={(event) => onSoEsteBloco(event.target.checked)}
          />
          Só este bloco
        </label>
      ) : null}
      <button
        type="button"
        className="ic"
        disabled={!ativo}
        aria-label="Tela cheia"
        title="Tela cheia"
        onClick={() => player()?.requestFullscreen()}
      >
        ⛶
      </button>
    </div>
  );
};
