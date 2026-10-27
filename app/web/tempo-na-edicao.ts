// Funil: quanto tempo a pessoa ficou na tela de edição deste vídeo. Manda ao sair da
// tela, ao trocar de vídeo ou quando a aba some (o celular pode fechar o app sem aviso).
import {useEffect} from "react";
import {evento} from "./api";

export const useTempoNaEdicao = (ativo: boolean, video: string | undefined) => {
  useEffect(() => {
    if (!ativo || !video) return;
    let inicio = Date.now();
    const mandar = () => {
      const segundos = Math.round((Date.now() - inicio) / 1000);
      if (segundos >= 1) evento("tempo_na_edicao", {video, segundos});
    };
    const aoMudar = () => {
      if (document.hidden) mandar();
      else inicio = Date.now();
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => {
      document.removeEventListener("visibilitychange", aoMudar);
      if (!document.hidden) mandar();
    };
  }, [ativo, video]);
};
