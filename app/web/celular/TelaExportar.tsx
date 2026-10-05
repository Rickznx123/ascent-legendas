// Tela de exportar: progresso enquanto o vídeo é gerado e, no fim, Baixar,
// Compartilhar (quando o navegador permite) e Voltar a editar.
import {useEffect, useRef, useState} from "react";
import {plataforma} from "../plataforma";
import type {Editor} from "../useEditor";

const urlDoExportado = (nome: string) => `/saidas/${encodeURIComponent(nome)}`;

// O navegador compartilha arquivos de vídeo (só em HTTPS ou no próprio computador).
const podeCompartilharVideo = (): boolean => {
  try {
    return Boolean(navigator.canShare?.({files: [new File([], "video.mp4", {type: "video/mp4"})]}));
  } catch {
    return false;
  }
};

export const TelaExportar: React.FC<{e: Editor; onVoltar: () => void}> = ({e, onVoltar}) => {
  const [compartilhando, setCompartilhando] = useState(false);
  const exportando = e.tarefa?.nome === "Exportar";
  const pronto = e.exportado;

  // Ao abrir a tela, exporta de novo (as edições podem ter mudado desde a última
  // vez). Só uma vez por abertura, mesmo com o efeito rodando duas vezes no modo
  // de desenvolvimento.
  const comecou = useRef(false);
  const {exportar, tarefa, podeExportar} = e;
  useEffect(() => {
    if (!comecou.current && !tarefa && podeExportar) {
      comecou.current = true;
      void exportar();
    }
  }, [exportar, tarefa, podeExportar]);

  const compartilhar = async () => {
    if (!pronto) {
      return;
    }
    setCompartilhando(true);
    try {
      const resposta = await fetch(urlDoExportado(pronto.nome));
      const arquivo = new File([await resposta.blob()], pronto.nome, {type: "video/mp4"});
      await navigator.share({files: [arquivo], title: pronto.nome});
    } catch (error) {
      // Fechar a janela de compartilhar não é erro.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        e.mostrarErro(error);
      }
    } finally {
      setCompartilhando(false);
    }
  };

  return (
    <div className="cel-tela">
      <header className="cel-barra">
        <button type="button" className="cel-ic" aria-label="Voltar a editar" disabled={exportando} onClick={onVoltar}>
          ‹
        </button>
        <span className="cel-nome">Exportar</span>
      </header>
      <div className="cel-centro">
        {pronto ? (
          <>
            <video className="cel-pronto" src={urlDoExportado(pronto.nome)} controls playsInline preload="metadata" />
            <h2>Vídeo pronto</h2>
            <p>{pronto.nome}</p>
            <div className="cel-pilha">
              <button type="button" className="bt primario cel-cheio" onClick={() => plataforma.baixarExportado(pronto.nome)}>
                Baixar
              </button>
              {podeCompartilharVideo() ? (
                <button type="button" className="bt cel-cheio" disabled={compartilhando} onClick={() => void compartilhar()}>
                  {compartilhando ? "Preparando…" : "Compartilhar"}
                </button>
              ) : null}
              <button type="button" className="bt cel-cheio" onClick={onVoltar}>
                Voltar a editar
              </button>
            </div>
          </>
        ) : exportando ? (
          <>
            <div className="cel-pronto cel-pronto-vazio" aria-hidden="true" />
            <h2>Exportando…</h2>
            <progress className="cel-progresso" max={1} value={e.tarefa?.fracao ?? undefined} />
            <p>
              {e.tarefa?.etapa}
              {e.tarefa?.fracao !== undefined ? ` ${Math.round(e.tarefa.fracao * 100)}%` : ""}
            </p>
            <p className="suave">O vídeo é gerado no computador. Pode bloquear a tela, mas não feche esta página.</p>
          </>
        ) : (
          <>
            <h2>{e.erro ? "Não deu para exportar" : "Exportar"}</h2>
            {e.erro ? <p>{e.erro}</p> : null}
            <div className="cel-pilha">
              <button type="button" className="bt primario cel-cheio" disabled={!e.podeExportar || e.ocupado} onClick={() => void e.exportar()}>
                {e.erro ? "Tentar de novo" : "Exportar agora"}
              </button>
              <button type="button" className="bt cel-cheio" onClick={onVoltar}>
                Voltar a editar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
