import {useEffect, useState} from "react";
import type {PlayerRef} from "@remotion/player";

// Quadro atual da prévia, se ela está tocando e se está sem som. Fica num gancho
// próprio para que só os controles e a linha do tempo redesenhem a cada quadro.
// ativo: a prévia está na tela (o Player existe).
export const useQuadroDaPrevia = (playerRef: React.RefObject<PlayerRef | null>, ativo: boolean) => {
  const [quadro, setQuadro] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);

  useEffect(() => {
    const player = playerRef.current;
    if (!ativo || !player) {
      return;
    }
    setQuadro(player.getCurrentFrame());
    setTocando(player.isPlaying());
    setMudo(player.isMuted());
    const aoMudarQuadro = ({detail}: {detail: {frame: number}}) => setQuadro(detail.frame);
    const aoTocar = () => setTocando(true);
    const aoParar = () => setTocando(false);
    const aoMudarSom = ({detail}: {detail: {isMuted: boolean}}) => setMudo(detail.isMuted);
    player.addEventListener("frameupdate", aoMudarQuadro);
    player.addEventListener("seeked", aoMudarQuadro);
    player.addEventListener("play", aoTocar);
    player.addEventListener("pause", aoParar);
    player.addEventListener("ended", aoParar);
    player.addEventListener("mutechange", aoMudarSom);
    return () => {
      player.removeEventListener("frameupdate", aoMudarQuadro);
      player.removeEventListener("seeked", aoMudarQuadro);
      player.removeEventListener("play", aoTocar);
      player.removeEventListener("pause", aoParar);
      player.removeEventListener("ended", aoParar);
      player.removeEventListener("mutechange", aoMudarSom);
    };
  }, [playerRef, ativo]);

  return {quadro, tocando, mudo};
};

// 75,4 s -> "1:15".
export const relogio = (ms: number): string => {
  const segundos = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
};

// Tempo de um bloco: 75,4 s -> "1:15.4".
export const tempoDoBloco = (ms: number): string => {
  const segundos = ms / 1000;
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${(segundos % 60).toFixed(1).padStart(4, "0")}`;
};
