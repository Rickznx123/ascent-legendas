// Layout de celular: Início, Editor (com a folha do bloco) e Exportar. O estado e as
// funções vêm de useEditor, os mesmos do computador.
import {useEffect, useRef, useState} from "react";
import {Avisos} from "../Avisos";
import type {Editor} from "../useEditor";
import {EditorCelular} from "./EditorCelular";
import {Inicio} from "./Inicio";
import {TelaExportar} from "./TelaExportar";

type Tela = "inicio" | "editor" | "exportar";

// Profundidade de cada tela (a folha aberta é mais um nível): o "voltar" do
// aparelho sobe um nível em vez de sair do app.
const NIVEL: Record<Tela, number> = {inicio: 0, editor: 1, exportar: 2};

export const LayoutCelular: React.FC<{e: Editor}> = ({e}) => {
  const [tela, setTela] = useState<Tela>("inicio");
  const [folhaAberta, setFolhaAberta] = useState(false);
  const nivel = NIVEL[tela] + (tela === "editor" && folhaAberta ? 1 : 0);

  // Cada nível a mais entra no histórico do navegador; o "voltar" do aparelho (ou
  // os botões de voltar da tela) tira um.
  const nivelNoHistorico = useRef(0);
  const subir = useRef(() => undefined as void);
  subir.current = () => {
    if (tela === "editor" && folhaAberta) {
      setFolhaAberta(false);
    } else if (tela === "exportar") {
      setTela("editor");
    } else if (tela === "editor") {
      e.playerRef.current?.pause();
      setTela("inicio");
    }
  };
  useEffect(() => {
    while (nivelNoHistorico.current < nivel) {
      nivelNoHistorico.current += 1;
      window.history.pushState({nivelCelular: nivelNoHistorico.current}, "");
    }
  }, [nivel]);
  useEffect(() => {
    const aoVoltar = () => {
      nivelNoHistorico.current = Math.max(0, nivelNoHistorico.current - 1);
      subir.current();
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);
  // Voltar pela tela: usa o histórico, para o "voltar" do aparelho não repetir o passo.
  const voltar = () => {
    if (nivelNoHistorico.current > 0) {
      window.history.back();
    } else {
      subir.current();
    }
  };

  // A aba do navegador saiu de foco: a prévia para.
  const {playerRef} = e;
  useEffect(() => {
    const aoMudar = () => document.hidden && playerRef.current?.pause();
    document.addEventListener("visibilitychange", aoMudar);
    return () => document.removeEventListener("visibilitychange", aoMudar);
  }, [playerRef]);

  // Teclado aberto: o campo em edição continua à vista.
  useEffect(() => {
    const mostrarCampo = () => {
      const campo = document.activeElement;
      if (campo instanceof HTMLInputElement && campo.closest(".cel")) {
        window.setTimeout(() => campo.scrollIntoView({block: "center", behavior: "smooth"}), 60);
      }
    };
    window.visualViewport?.addEventListener("resize", mostrarCampo);
    document.addEventListener("focusin", mostrarCampo);
    return () => {
      window.visualViewport?.removeEventListener("resize", mostrarCampo);
      document.removeEventListener("focusin", mostrarCampo);
    };
  }, []);

  const abrirVideo = (nome: string) => {
    if (nome !== e.video) {
      e.setVideo(nome);
    }
    setFolhaAberta(false);
    setTela("editor");
  };

  return (
    <div className="cel">
      {tela === "inicio" ? <Inicio e={e} onAbrir={abrirVideo} /> : null}
      {tela === "editor" ? (
        <EditorCelular
          e={e}
          folhaAberta={folhaAberta}
          onAbrirFolha={() => setFolhaAberta(true)}
          onFecharFolha={() => folhaAberta && voltar()}
          onVoltar={voltar}
          onExportar={() => {
            e.playerRef.current?.pause();
            setFolhaAberta(false);
            setTela("exportar");
          }}
        />
      ) : null}
      {tela === "exportar" ? <TelaExportar e={e} onVoltar={voltar} /> : null}
      <Avisos avisos={e.avisos} erro={e.erro} onFecharAviso={e.fecharAviso} onFecharErro={() => e.setErro(undefined)} />
    </div>
  );
};
