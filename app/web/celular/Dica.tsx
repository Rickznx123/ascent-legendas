// Dica de uma linha que some depois do primeiro uso (ou ao tocar no ✕) e não volta
// mais neste aparelho. Guardada no navegador; sem acesso a ele, a dica só reaparece.
import {useEffect, useState} from "react";

const EVENTO = "cel-dica-vista";
const chaveGuardada = (nome: string) => `cel-dica-${nome}`;

const jaVista = (nome: string): boolean => {
  try {
    return window.localStorage.getItem(chaveGuardada(nome)) === "1";
  } catch {
    return false;
  }
};

// A ação que a dica ensina aconteceu: a dica some (aqui e onde mais estiver aberta).
export const marcarDica = (nome: string) => {
  try {
    window.localStorage.setItem(chaveGuardada(nome), "1");
  } catch {
    // Sem guardar: a dica some agora e volta na próxima visita.
  }
  window.dispatchEvent(new CustomEvent(EVENTO, {detail: nome}));
};

export const Dica: React.FC<{nome: string; children: React.ReactNode}> = ({nome, children}) => {
  const [vista, setVista] = useState(() => jaVista(nome));
  useEffect(() => {
    const aoVer = (event: Event) => (event as CustomEvent<string>).detail === nome && setVista(true);
    window.addEventListener(EVENTO, aoVer);
    return () => window.removeEventListener(EVENTO, aoVer);
  }, [nome]);
  return vista ? null : (
    <p className="cel-ajuda cel-dica">
      <span>{children}</span>
      <button type="button" className="cel-dica-fechar" aria-label="Fechar dica" onClick={() => marcarDica(nome)}>
        ✕
      </button>
    </p>
  );
};
