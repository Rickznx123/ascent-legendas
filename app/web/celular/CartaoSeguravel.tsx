// Cartão das abas Cores e Sons: um toque faz uma coisa, segurar o dedo (~500 ms) faz
// outra (aplicar ao vídeo inteiro). Enquanto segura, o cartão enche; ao aplicar, pulsa.
import {useEffect, useRef, useState} from "react";

// Tempo segurando (ms) para valer como "segurar".
const TEMPO_PARA_SEGURAR = 500;
// Dedo que andou mais que isso (px) está rolando a lista, não tocando.
const FOLGA_DO_DEDO = 10;
// Duração do pulso depois de segurar (ms).
const TEMPO_DO_PULSO = 600;

type Toque = {x: number; y: number; timer: number};

export const CartaoSeguravel: React.FC<{
  className?: string;
  rotulo: string;
  marcado: boolean;
  desativado?: boolean;
  onToque: () => void;
  // Sem onSegurar, segurar não faz nada além do toque.
  onSegurar?: () => void;
  children: React.ReactNode;
}> = ({className = "", rotulo, marcado, desativado = false, onToque, onSegurar, children}) => {
  const toque = useRef<Toque | undefined>(undefined);
  const [estado, setEstado] = useState<"" | "segurando" | "aplicado">("");
  const pulso = useRef<number | undefined>(undefined);

  const cancelar = () => {
    if (toque.current) {
      window.clearTimeout(toque.current.timer);
      toque.current = undefined;
    }
    setEstado((atual) => (atual === "segurando" ? "" : atual));
  };
  useEffect(
    () => () => {
      cancelar();
      window.clearTimeout(pulso.current);
    },
    [],
  );

  return (
    <button
      type="button"
      className={`cel-opcao ${className} ${estado ? `cel-opcao-${estado}` : ""}`}
      aria-pressed={marcado}
      aria-label={rotulo}
      disabled={desativado}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        cancelar();
        const timer = window.setTimeout(() => {
          toque.current = undefined;
          if (!onSegurar) {
            setEstado("");
            return;
          }
          navigator.vibrate?.(20);
          setEstado("aplicado");
          window.clearTimeout(pulso.current);
          pulso.current = window.setTimeout(() => setEstado(""), TEMPO_DO_PULSO);
          onSegurar();
        }, TEMPO_PARA_SEGURAR);
        toque.current = {x: event.clientX, y: event.clientY, timer};
        if (onSegurar) {
          setEstado("segurando");
        }
      }}
      onPointerMove={(event) => {
        const atual = toque.current;
        if (atual && Math.hypot(event.clientX - atual.x, event.clientY - atual.y) > FOLGA_DO_DEDO) {
          cancelar();
        }
      }}
      onPointerUp={() => {
        // Soltou antes do tempo de segurar: foi um toque.
        if (toque.current) {
          cancelar();
          onToque();
        }
      }}
      onPointerCancel={cancelar}
      onPointerLeave={cancelar}
      // Pelo teclado (sem ponteiro), Enter/Espaço contam como toque.
      onClick={(event) => event.detail === 0 && onToque()}
      // Segurar o dedo não abre o menu do navegador.
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
};
