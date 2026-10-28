import {useEffect, useState} from "react";
import {Avisos} from "./Avisos";
import {Andamento} from "./celular/Andamento";
import {LayoutCelular} from "./celular/LayoutCelular";
import {useConta} from "./conta";
import {LayoutComputador} from "./LayoutComputador";
import {MenuDaConta} from "./MenuDaConta";
import {EditorDeCortes, ListaDeProjetos} from "./Projetos";
import type {Abrir} from "./Projetos";
import {useEditor} from "./useEditor";
import type {Editor} from "./useEditor";

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

// Computador com login: a tela de projetos, os cortes de um projeto e as legendas
// (o editor de sempre). Sem login (modo local), direto o editor, como antes.
// legendas.cortes: o projeto de onde as legendas vieram ("Cortes" volta para ele).
type Tela = {tela: "projetos"} | {tela: "cortes"; id: string} | {tela: "legendas"; cortes?: string};

const Computador: React.FC<{e: Editor}> = ({e}) => {
  const {conta} = useConta();
  const [tela, setTela] = useState<Tela>({tela: "projetos"});
  if (!conta || tela.tela === "legendas") {
    const cortes = tela.tela === "legendas" ? tela.cortes : undefined;
    return (
      <LayoutComputador
        e={e}
        onProjetos={conta ? () => setTela({tela: "projetos"}) : undefined}
        onCortes={conta && cortes ? () => setTela({tela: "cortes", id: cortes}) : undefined}
      />
    );
  }
  const legendar = (video: string, cortes?: string) => {
    if (video !== e.video) e.setVideo(video);
    setTela({tela: "legendas", cortes});
  };
  const abrir: Abrir = (alvo) => ("video" in alvo ? legendar(alvo.video, alvo.id) : setTela({tela: "cortes", id: alvo.id}));
  return (
    <div className="projetos-pc">
      <header className="projetos-pc-barra">
        {tela.tela === "cortes" ? (
          <button type="button" className="bt" onClick={() => setTela({tela: "projetos"})}>
            ‹ Projetos
          </button>
        ) : (
          <b>Ascent Legendas</b>
        )}
        <MenuDaConta ocupado={e.ocupado} />
      </header>
      <main className="projetos-pc-conteudo">
        {tela.tela === "cortes" ? (
          <EditorDeCortes e={e} id={tela.id} onLegendar={(video) => legendar(video, tela.id)} onApagado={() => setTela({tela: "projetos"})} />
        ) : (
          <ListaDeProjetos e={e} onAbrir={abrir} />
        )}
      </main>
      <Andamento tarefa={e.tarefa} />
      <Avisos avisos={e.avisos} erro={e.erro} onFecharAviso={e.fecharAviso} onFecharErro={() => e.setErro(undefined)} />
    </div>
  );
};

// Os dois layouts usam o mesmo estado e as mesmas funções (useEditor); só as telas mudam.
export const App: React.FC = () => {
  const editor = useEditor();
  return useEhCelular() ? <LayoutCelular e={editor} /> : <Computador e={editor} />;
};
