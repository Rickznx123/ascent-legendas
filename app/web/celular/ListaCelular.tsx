// Lista de legendas no celular: tocar numa palavra já edita (PalavraCelular); tocar
// no bloco leva a prévia até ele; o botão ⋯ abre a folha de ajustes do bloco.
import {useEffect, useRef} from "react";
import {findKeywordIndex} from "../../../src/captions";
import type {BlockTiming} from "../../../src/tempos";
import type {AssignedCaptionBlock} from "../../../src/types";
import {SelosDoBloco} from "../ListaDeBlocos";
import {tempoDoBloco} from "../quadro";
import {PalavraCelular} from "./PalavraCelular";

type Props = {
  blocos: AssignedCaptionBlock[];
  timeline: BlockTiming[];
  blocoAtivo: number;
  blocoSelecionado: number;
  onIrPara: (bloco: number) => void;
  onAjustes: (bloco: number) => void;
  onTexto: (bloco: number, palavra: number, texto: string) => void;
};

// Uma palavra sendo editada nesta lista: a rolagem automática não pode tirá-la da vista.
const editandoNaLista = (lista: HTMLElement | null) =>
  document.activeElement instanceof HTMLInputElement && Boolean(lista?.contains(document.activeElement));

export const ListaCelular: React.FC<Props> = ({blocos, timeline, blocoAtivo, blocoSelecionado, onIrPara, onAjustes, onTexto}) => {
  const lista = useRef<HTMLDivElement>(null);
  const ativoRef = useRef<HTMLElement>(null);
  const selecionadoRef = useRef<HTMLElement>(null);

  // Mantém à vista o bloco tocando e o bloco escolhido (menos durante uma edição).
  useEffect(() => {
    if (!editandoNaLista(lista.current)) {
      ativoRef.current?.scrollIntoView({block: "nearest", behavior: "smooth"});
    }
  }, [blocoAtivo]);
  useEffect(() => {
    if (!editandoNaLista(lista.current)) {
      selecionadoRef.current?.scrollIntoView({block: "nearest", behavior: "smooth"});
    }
  }, [blocoSelecionado]);

  return (
    <div ref={lista} className="lista">
      {blocos.map((bloco, indice) => {
        const chave = findKeywordIndex(bloco.words, bloco.keyword);
        const selecionado = indice === blocoSelecionado;
        const classes = [
          "bloco",
          "cel-bloco",
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
            onClick={() => onIrPara(indice)}
          >
            <div className="cab">
              <b>#{indice + 1}</b>
              <span>{tempoDoBloco(timeline[indice]?.showMs ?? bloco.startMs)}</span>
              <SelosDoBloco bloco={bloco} />
              <span className={`selo selo-layout ${bloco.family === "destaque" ? "selo-destaque" : ""}`}>{bloco.template}</span>
            </div>
            <div className="cel-bloco-linha">
              <div className="palavras">
                {bloco.words.map((palavra, posicao) => (
                  <PalavraCelular
                    key={`${palavra.startMs}-${posicao}`}
                    texto={palavra.text}
                    chave={posicao === chave}
                    rotulo={`Palavra ${posicao + 1} do bloco ${indice + 1}`}
                    onEditar={(texto) => onTexto(indice, posicao, texto)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="cel-ic cel-mais"
                aria-label={`Ajustes do bloco ${indice + 1}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAjustes(indice);
                }}
              >
                ⋯
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
};
