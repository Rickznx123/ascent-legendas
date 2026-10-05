// Aviso curto com "Desfazer" (ex.: "Palavra excluída · Desfazer"). Some sozinho e
// também quando os blocos mudam de novo: aí o desfazer já não seria daquela ação.
import {useEffect, useRef} from "react";
import type {AssignedCaptionBlock} from "../../../src/types";

// Quanto tempo o aviso fica na tela.
const DURACAO_MS = 5000;

export type AvisoComDesfazer = {id: number; texto: string};

export const AvisoDesfazer: React.FC<{
  aviso?: AvisoComDesfazer;
  blocos: AssignedCaptionBlock[];
  onDesfazer: () => void;
  onFechar: () => void;
}> = ({aviso, blocos, onDesfazer, onFechar}) => {
  // Blocos logo depois da ação (a primeira mudança depois que o aviso aparece).
  const blocosDaAcao = useRef<AssignedCaptionBlock[] | undefined>(undefined);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    blocosDaAcao.current = undefined;
    if (!aviso) {
      return;
    }
    const timer = window.setTimeout(() => fechar.current(), DURACAO_MS);
    return () => window.clearTimeout(timer);
  }, [aviso]);

  const anteriores = useRef(blocos);
  useEffect(() => {
    if (blocos === anteriores.current) {
      return;
    }
    anteriores.current = blocos;
    if (!aviso) {
      return;
    }
    if (blocosDaAcao.current === undefined) {
      blocosDaAcao.current = blocos;
    } else {
      fechar.current();
    }
  }, [blocos, aviso]);

  return aviso ? (
    <div className="cel-aviso-desfazer" role="status" aria-live="polite">
      <span>{aviso.texto}</span>
      <button
        type="button"
        className="cel-aviso-acao"
        onClick={() => {
          onFechar();
          onDesfazer();
        }}
      >
        Desfazer
      </button>
    </div>
  ) : null;
};
