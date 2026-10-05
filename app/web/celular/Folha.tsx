// Folha que sobe por cima das abas com os ajustes de um bloco. Arrastar a alça
// para baixo (ou tocar fora dela) fecha.
import {useEffect, useRef, useState} from "react";

// Quanto arrastar para baixo (px) para a folha fechar.
const ARRASTO_PARA_FECHAR = 70;

export const Folha: React.FC<{
  titulo: React.ReactNode;
  onFechar: () => void;
  // Fora da folha, mas que não fecha (a prévia: com a folha aberta, arrastar a
  // legenda move o bloco).
  ignorarFora: string;
  children: React.ReactNode;
}> = ({titulo, onFechar, ignorarFora, children}) => {
  const folha = useRef<HTMLElement>(null);
  const inicio = useRef<number | undefined>(undefined);
  const [deslocamento, setDeslocamento] = useState(0);

  // Tocar fora fecha.
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  useEffect(() => {
    const aoTocar = (event: PointerEvent) => {
      const alvo = event.target instanceof Element ? event.target : null;
      if (alvo && !folha.current?.contains(alvo) && !alvo.closest(ignorarFora)) {
        fechar.current();
      }
    };
    document.addEventListener("pointerdown", aoTocar);
    return () => document.removeEventListener("pointerdown", aoTocar);
  }, [ignorarFora]);

  const soltar = () => {
    inicio.current = undefined;
    if (deslocamento > ARRASTO_PARA_FECHAR) {
      onFechar();
    }
    setDeslocamento(0);
  };

  return (
    <section
      ref={folha}
      className={`cel-folha ${inicio.current !== undefined ? "cel-folha-arrastando" : ""}`}
      style={deslocamento ? {transform: `translateY(${deslocamento}px)`} : undefined}
      role="dialog"
      aria-label="Ajustes do bloco"
    >
      <div
        className="cel-folha-alca"
        onPointerDown={(event) => {
          inicio.current = event.clientY;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (inicio.current !== undefined) {
            setDeslocamento(Math.max(0, event.clientY - inicio.current));
          }
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <span className="cel-pega" aria-hidden="true" />
        <div className="cel-folha-titulo">
          {titulo}
          <button type="button" className="cel-ic" aria-label="Fechar ajustes do bloco" onClick={onFechar}>
            ✕
          </button>
        </div>
      </div>
      <div className="cel-folha-conteudo">{children}</div>
    </section>
  );
};
