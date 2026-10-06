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

// Campos que não abrem o teclado.
const CAMPOS_SEM_TECLADO = new Set(["range", "checkbox", "radio", "button", "color", "file"]);

// Põe o campo no meio da lista que rola em volta dele (sem rolar a página: no iOS
// isso empurraria o app para cima do teclado).
const centralizarNaLista = (campo: HTMLElement) => {
  const lista = campo.closest<HTMLElement>(".cel-conteudo, .cel-folha-conteudo, .cel-rolagem");
  if (!lista) {
    return;
  }
  const caixaDoCampo = campo.getBoundingClientRect();
  const caixaDaLista = lista.getBoundingClientRect();
  const desvio = caixaDoCampo.top + caixaDoCampo.height / 2 - (caixaDaLista.top + caixaDaLista.height / 2);
  if (Math.abs(desvio) > 4) {
    lista.scrollBy({top: desvio, behavior: "smooth"});
  }
};

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

  // Teclado aberto (um campo de texto em foco): o app ocupa só a área visível acima
  // do teclado (visualViewport), as abas e a linha de tocar saem, a prévia encolhe
  // (até 35% da área visível, não menos; celular.css) e o campo vai para o meio da
  // lista em que está.
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const elemento = raiz.current;
    const visivel = window.visualViewport;
    if (!elemento) {
      return;
    }
    const campoEmFoco = () => {
      const campo = document.activeElement;
      return campo instanceof HTMLInputElement && !CAMPOS_SEM_TECLADO.has(campo.type) && elemento.contains(campo)
        ? campo
        : undefined;
    };
    let quadro = 0;
    const atualizar = () => {
      const campo = campoEmFoco();
      elemento.classList.toggle("cel-teclado", Boolean(campo));
      if (campo && visivel) {
        elemento.style.setProperty("--altura-visivel", `${visivel.height}px`);
        elemento.style.setProperty("--topo-visivel", `${visivel.offsetTop}px`);
      } else {
        elemento.style.removeProperty("--altura-visivel");
        elemento.style.removeProperty("--topo-visivel");
      }
      if (campo) {
        window.cancelAnimationFrame(quadro);
        quadro = window.requestAnimationFrame(() => centralizarNaLista(campo));
      }
    };
    // No focusout o próximo campo ainda não recebeu o foco: confere logo depois.
    const aoSairDoCampo = () => window.setTimeout(atualizar, 0);
    document.addEventListener("focusin", atualizar);
    document.addEventListener("focusout", aoSairDoCampo);
    visivel?.addEventListener("resize", atualizar);
    visivel?.addEventListener("scroll", atualizar);
    return () => {
      window.cancelAnimationFrame(quadro);
      document.removeEventListener("focusin", atualizar);
      document.removeEventListener("focusout", aoSairDoCampo);
      visivel?.removeEventListener("resize", atualizar);
      visivel?.removeEventListener("scroll", atualizar);
    };
  }, []);

  // Exportação retomada (voltou para o app, recarregou ou abriu o projeto com uma
  // em curso ou pronta e ainda não vista): vai para a tela de exportar.
  useEffect(() => {
    if (e.exportacaoRetomada > 0) {
      setFolhaAberta(false);
      setTela("exportar");
    }
  }, [e.exportacaoRetomada]);

  const abrirVideo = (nome: string) => {
    if (nome !== e.video) {
      e.setVideo(nome);
    }
    setFolhaAberta(false);
    setTela("editor");
  };

  return (
    <div ref={raiz} className="cel">
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
            // Uma exportação nova (o vídeo pronto da anterior não fica na tela).
            if (!e.ocupado) {
              e.setExportado(undefined);
            }
            setTela("exportar");
          }}
        />
      ) : null}
      {tela === "exportar" ? <TelaExportar e={e} onVoltar={voltar} /> : null}
      <Avisos avisos={e.avisos} erro={e.erro} onFecharAviso={e.fecharAviso} onFecharErro={() => e.setErro(undefined)} />
    </div>
  );
};
