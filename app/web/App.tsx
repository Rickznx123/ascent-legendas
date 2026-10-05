import {useEffect, useState} from "react";
import {LayoutCelular} from "./celular/LayoutCelular";
import {LayoutComputador} from "./LayoutComputador";
import {useEditor} from "./useEditor";

// Abaixo desta largura (em px), o app mostra o layout de celular.
const LARGURA_DO_CELULAR = 820;
const CONSULTA_DO_CELULAR = `(max-width: ${LARGURA_DO_CELULAR - 0.02}px)`;

const useEhCelular = (): boolean => {
  const [celular, setCelular] = useState(() => window.matchMedia(CONSULTA_DO_CELULAR).matches);
  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_DO_CELULAR);
    const aoMudar = () => setCelular(consulta.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);
  return celular;
};

// Os dois layouts usam o mesmo estado e as mesmas funções (useEditor); só as telas mudam.
export const App: React.FC = () => {
  const editor = useEditor();
  return useEhCelular() ? <LayoutCelular e={editor} /> : <LayoutComputador e={editor} />;
};
