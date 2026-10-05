import {useEffect, useRef, useState} from "react";
import {findKeywordIndex} from "../../src/captions";
import type {BlockTiming} from "../../src/tempos";
import type {AssignedCaptionBlock} from "../../src/types";
import {tempoDoBloco} from "./quadro";

type Props = {
  blocos: AssignedCaptionBlock[];
  timeline: BlockTiming[];
  blocoAtivo: number;
  // Bloco escolhido com um clique (os ajustes e a galeria valem para ele).
  blocoSelecionado: number;
  onIrPara: (bloco: number) => void;
  onTexto: (bloco: number, palavra: number, texto: string) => void;
  onPalavraChave: (bloco: number, palavra: number) => void;
  onExcluirPalavra: (bloco: number, palavra: number) => void;
};

// Tempo para separar um clique de um duplo clique.
const ESPERA_DUPLO_CLIQUE_MS = 250;

// Uma palavra do bloco: clique destaca, duplo clique edita (Enter confirma, Esc
// cancela). Apagar todo o texto e confirmar exclui a palavra. No celular, dois
// toques seguidos editam (o navegador nem sempre transforma dois toques em duplo clique).
export const Palavra: React.FC<{
  texto: string;
  chave: boolean;
  rotulo: string;
  onDestacar: () => void;
  onEditar: (texto: string) => void;
  onExcluir: () => void;
}> = ({texto, chave, rotulo, onDestacar, onEditar, onExcluir}) => {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(texto);
  const cliqueTimer = useRef<number | undefined>(undefined);
  // Esc cancela: o blur que vem depois não pode confirmar (nem excluir).
  const cancelado = useRef(false);

  useEffect(() => () => window.clearTimeout(cliqueTimer.current), []);

  const confirmar = () => {
    const limpo = rascunho.trim();
    setEditando(false);
    if (cancelado.current) {
      cancelado.current = false;
      return;
    }
    if (!limpo) {
      onExcluir();
    } else if (limpo !== texto) {
      onEditar(limpo);
    }
  };

  const editar = () => {
    window.clearTimeout(cliqueTimer.current);
    cliqueTimer.current = undefined;
    setRascunho(texto);
    cancelado.current = false;
    setEditando(true);
  };

  if (editando) {
    return (
      <input
        className={`palavra palavra-editando ${chave ? "palavra-chave" : ""}`}
        value={rascunho}
        size={Math.max(2, rascunho.length)}
        autoFocus
        aria-label={rotulo}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setRascunho(event.target.value)}
        onBlur={confirmar}
        title="Apague todo o texto e confirme para excluir a palavra"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            cancelado.current = true;
            setEditando(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`palavra ${chave ? "palavra-chave" : ""}`}
      aria-pressed={chave}
      aria-label={`${rotulo}: ${texto}${chave ? " (palavra-chave)" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        // Segundo clique (ou toque) antes de o primeiro virar destaque: edita.
        if (cliqueTimer.current !== undefined) {
          editar();
          return;
        }
        cliqueTimer.current = window.setTimeout(() => {
          cliqueTimer.current = undefined;
          onDestacar();
        }, ESPERA_DUPLO_CLIQUE_MS);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        editar();
      }}
      onKeyDown={(event) => {
        // F2 edita pelo teclado (Enter/Espaço destacam, como o clique).
        if (event.key === "F2") {
          event.stopPropagation();
          editar();
        }
      }}
    >
      {texto}
    </button>
  );
};

// Selos que valem para a lista e para os ajustes do bloco.
export const SelosDoBloco: React.FC<{bloco: AssignedCaptionBlock}> = ({bloco}) => (
  <>
    {bloco.review ? <span className="selo selo-revisar">revisar</span> : null}
    {bloco.dupla ? (
      <span className="selo selo-dupla" title="Na tela junto com o bloco ligado">
        {bloco.dupla === "primeiro" ? "dupla ↓" : "↑ dupla"}
      </span>
    ) : null}
    {bloco.posicao ? (
      <span className="selo selo-posicao" title={`Posição própria: ${bloco.posicao.x}% × ${bloco.posicao.y}%`}>
        ⌖
      </span>
    ) : null}
  </>
);

export const ListaDeBlocos: React.FC<Props> = ({
  blocos,
  timeline,
  blocoAtivo,
  blocoSelecionado,
  onIrPara,
  onTexto,
  onPalavraChave,
  onExcluirPalavra,
}) => {
  const ativoRef = useRef<HTMLElement>(null);
  const selecionadoRef = useRef<HTMLElement>(null);

  // Mantém o bloco tocando à vista na lista.
  useEffect(() => {
    ativoRef.current?.scrollIntoView({block: "nearest", behavior: "smooth"});
  }, [blocoAtivo]);

  // Bloco escolhido (na lista ou na linha do tempo) também fica à vista.
  useEffect(() => {
    selecionadoRef.current?.scrollIntoView({block: "nearest", behavior: "smooth"});
  }, [blocoSelecionado]);

  return (
    <div className="lista">
      <p className="ajuda">Clique na palavra para destacar · duplo clique (ou F2) para editar · apague o texto para excluir</p>
      {blocos.map((bloco, indice) => {
        const chave = findKeywordIndex(bloco.words, bloco.keyword);
        const selecionado = indice === blocoSelecionado;
        const classes = [
          "bloco",
          bloco.review ? "bloco-revisar" : "",
          bloco.dupla ? `bloco-dupla bloco-dupla-${bloco.dupla}` : "",
          indice === blocoAtivo ? "bloco-ativo" : "",
        ].join(" ");

        return (
          <article
            key={`${bloco.startMs}-${indice}`}
            ref={(elemento) => {
              if (indice === blocoAtivo) ativoRef.current = elemento;
              if (selecionado) selecionadoRef.current = elemento;
            }}
            className={classes}
            aria-current={selecionado ? "true" : undefined}
            aria-label={`Bloco ${indice + 1}`}
            tabIndex={0}
            onClick={() => onIrPara(indice)}
            onKeyDown={(event) => {
              // Enter escolhe o bloco (o espaço toca e pausa a prévia).
              if (event.target === event.currentTarget && event.key === "Enter") {
                event.preventDefault();
                onIrPara(indice);
              }
            }}
          >
            <div className="cab">
              <b>#{indice + 1}</b>
              <span>{tempoDoBloco(timeline[indice]?.showMs ?? bloco.startMs)}</span>
              <SelosDoBloco bloco={bloco} />
              <span className={`selo selo-layout ${bloco.family === "destaque" ? "selo-destaque" : ""}`}>{bloco.template}</span>
            </div>
            <div className="palavras">
              {bloco.words.map((palavra, posicao) => (
                <Palavra
                  key={`${palavra.startMs}-${posicao}`}
                  texto={palavra.text}
                  chave={posicao === chave}
                  rotulo={`Palavra ${posicao + 1} do bloco ${indice + 1}`}
                  onDestacar={() => onPalavraChave(indice, posicao)}
                  onEditar={(texto) => onTexto(indice, posicao, texto)}
                  onExcluir={() => onExcluirPalavra(indice, posicao)}
                />
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
};
