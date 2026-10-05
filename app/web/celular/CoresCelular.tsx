// Aba Cores no celular, no desenho da aba Templates: chips em cima (todas as cores
// ou só as que o vídeo usa), cartões embaixo com a palavra-chave do bloco pintada
// em cada cor. Tocar aplica ao bloco selecionado (sem bloco, ao vídeo); segurar
// aplica ao vídeo inteiro.
import {useState} from "react";
import {keywordBackground} from "../../../src/KineticCaptionVideo";
import type {Editor} from "../useEditor";
import {CartaoSeguravel} from "./CartaoSeguravel";

type Filtro = "todas" | "em-uso";

export const CoresCelular: React.FC<{e: Editor}> = ({e}) => {
  const {estilo, blocos, blocoAcoes} = e;
  const [filtro, setFiltro] = useState<Filtro>("todas");
  if (!estilo) {
    return <p className="vazio">Carregando cores...</p>;
  }
  const indice = e.blocoSelecionado;
  const bloco = blocos[indice];
  const corDoVideo = estilo.paleta;
  const emUso = new Set([corDoVideo, ...blocos.map((b) => b.paleta).filter((p): p is string => Boolean(p))]);
  const nomes = e.catalogo.paletas.filter((nome) => estilo.paletas[nome] && (filtro === "todas" || emUso.has(nome)));
  const blocosComCor = blocos.filter((b) => b.paleta).length;
  // A palavra que aparece pintada nos cartões: a palavra-chave do bloco, ou um exemplo.
  const amostra = bloco ? (bloco.keyword ?? bloco.words[0]?.text ?? "cor") : "destaque";
  const desativado = e.ocupado || !e.projetoDoVideo;

  const aplicar = (nome: string | undefined) => {
    if (bloco) {
      blocoAcoes.cor(indice, nome);
    } else if (nome) {
      void e.trocarPaleta(nome);
    }
  };

  return (
    <div className="cel-aba-opcoes">
      <div className="chips" role="group" aria-label="Quais cores mostrar">
        <button type="button" className="chip" aria-pressed={filtro === "todas"} onClick={() => setFiltro("todas")}>
          Todas
        </button>
        <button type="button" className="chip" aria-pressed={filtro === "em-uso"} onClick={() => setFiltro("em-uso")}>
          Em uso
        </button>
      </div>
      <p className="cel-contexto">
        {bloco ? (
          <>
            <b>Bloco #{indice + 1}</b> · toque aplica ao bloco · segure para o vídeo inteiro
          </>
        ) : (
          <>Toque aplica ao vídeo inteiro · escolha um bloco na lista para colorir só ele</>
        )}
      </p>
      <div className="cel-cartoes" role="group" aria-label="Cores">
        {bloco ? (
          <CartaoSeguravel
            rotulo={`Padrão: o bloco ${indice + 1} usa a cor do vídeo`}
            marcado={!bloco.paleta}
            desativado={desativado}
            onToque={() => aplicar(undefined)}
          >
            <span className="cel-opcao-amostra cel-opcao-padrao">padrão</span>
            <small className="cel-opcao-nome">cor do vídeo</small>
          </CartaoSeguravel>
        ) : null}
        {nomes.map((nome) => {
          const doBloco = bloco?.paleta === nome;
          const doVideo = nome === corDoVideo;
          return (
            <CartaoSeguravel
              key={nome}
              rotulo={`${nome}${doVideo ? " (cor do vídeo)" : ""}${doBloco ? " (cor do bloco)" : ""}`}
              marcado={bloco ? doBloco : doVideo}
              desativado={desativado}
              onToque={() => aplicar(nome)}
              onSegurar={() => void e.trocarPaleta(nome)}
            >
              <span
                className="cel-opcao-amostra cel-opcao-pintada"
                style={{background: keywordBackground(estilo.paletas[nome]), WebkitBackgroundClip: "text", backgroundClip: "text"}}
              >
                {amostra}
              </span>
              <small className="cel-opcao-nome">{nome}</small>
              {doVideo ? <em className="cel-opcao-selo">vídeo</em> : null}
            </CartaoSeguravel>
          );
        })}
      </div>
      {blocosComCor > 0 ? (
        <button type="button" className="bt cel-cheio cel-acao-rodape" disabled={desativado} onClick={e.limparCores}>
          Limpar cores dos blocos ({blocosComCor})
        </button>
      ) : null}
    </div>
  );
};
