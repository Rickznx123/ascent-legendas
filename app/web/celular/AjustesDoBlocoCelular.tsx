// Ajustes do bloco na folha do celular. Usa os campos do computador (layout, cor,
// som) e troca o resto pelo desenho da referência: palavras que editam com um
// toque, posição em Cima / Meio / Baixo e Dividir / Juntar / Excluir lado a lado.
// As peças do computador que saem ficam escondidas em celular.css.
import {Fragment, useEffect, useRef, useState} from "react";
import {findKeywordIndex} from "../../../src/captions";
import {PREDEFINICOES} from "../../../src/posicao";
import {AjustesDoBloco} from "../AjustesDoBloco";
import {PalavraCelular} from "./PalavraCelular";

type Props = React.ComponentProps<typeof AjustesDoBloco>;

// Nomes curtos da referência para as posições pré-definidas (na mesma ordem).
const NOMES_DAS_POSICOES = ["Cima", "Meio", "Baixo"];

export const AjustesDoBlocoCelular: React.FC<Props> = (props) => {
  const {indice, blocos, posicaoGeral, ocupado, onTexto, onPalavraChave, onDividir, onJuntar, onExcluirBloco, onInicioPosicao, onPosicaoDoBloco} =
    props;
  const bloco = blocos[indice];
  // "Dividir" mostra os ✂ entre as palavras; tocar num deles divide ali.
  const [dividindo, setDividindo] = useState(false);
  const palavras = bloco?.words.length ?? 0;
  useEffect(() => setDividindo(false), [indice, palavras]);
  // O botão fica no fim da folha e os ✂ nas palavras, no topo: a folha rola até elas.
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dividindo) {
      raiz.current?.querySelector(".cel-palavras-bloco")?.scrollIntoView({block: "nearest", behavior: "smooth"});
    }
  }, [dividindo]);

  if (!bloco) {
    return <AjustesDoBloco {...props} />;
  }
  const posicao = bloco.posicao ?? posicaoGeral;
  const chave = findKeywordIndex(bloco.words, bloco.keyword);

  return (
    <div ref={raiz} className={`cel-ajustes-bloco ${dividindo ? "cel-dividindo" : ""}`}>
      <AjustesDoBloco {...props} mostrarSoEsteBloco={false} />

      <div className="palavras cel-palavras-bloco">
        {bloco.words.map((palavra, posicaoNaFrase) => (
          <Fragment key={`${palavra.startMs}-${posicaoNaFrase}`}>
            {dividindo && posicaoNaFrase > 0 ? (
              <button
                type="button"
                className="dividir"
                aria-label={`Dividir o bloco ${indice + 1} antes de "${palavra.text}"`}
                onClick={() => onDividir(indice, posicaoNaFrase)}
              >
                ✂
              </button>
            ) : null}
            <PalavraCelular
              texto={palavra.text}
              chave={posicaoNaFrase === chave}
              rotulo={`Palavra ${posicaoNaFrase + 1} do bloco ${indice + 1}`}
              onEditar={(texto) => onTexto(indice, posicaoNaFrase, texto)}
            />
          </Fragment>
        ))}
      </div>

      {dividindo ? <p className="cel-ajuda cel-ajuda-dividir">Toque no ✂ onde o bloco deve ser dividido</p> : null}

      <div className="campo cel-campo-destaque">
        <span className="rotulo">Destaque</span>
        <span className="cel-escolhas" role="radiogroup" aria-label={`Palavra-chave do bloco ${indice + 1}`}>
          {bloco.words.map((palavra, posicaoNaFrase) => (
            <button
              key={`${palavra.startMs}-${posicaoNaFrase}`}
              type="button"
              role="radio"
              className="chip"
              aria-checked={posicaoNaFrase === chave}
              disabled={ocupado}
              onClick={() => posicaoNaFrase !== chave && onPalavraChave(indice, posicaoNaFrase)}
            >
              {palavra.text}
            </button>
          ))}
        </span>
      </div>

      <div className="campo cel-campo-posicao">
        <span className="rotulo">Posição</span>
        <span className="seg" role="group" aria-label={`Posição do bloco ${indice + 1}`}>
          {PREDEFINICOES.map((predefinicao, n) => (
            <button
              key={predefinicao.nome}
              type="button"
              disabled={ocupado}
              aria-pressed={posicao.x === predefinicao.posicao.x && posicao.y === predefinicao.posicao.y}
              onClick={() => {
                onInicioPosicao();
                onPosicaoDoBloco(indice, predefinicao.posicao);
              }}
            >
              {NOMES_DAS_POSICOES[n] ?? predefinicao.nome}
            </button>
          ))}
        </span>
      </div>

      <div className="cel-acoes-bloco">
        <button
          type="button"
          className="bt"
          disabled={ocupado || palavras < 2}
          aria-pressed={dividindo}
          onClick={() => (palavras === 2 ? onDividir(indice, 1) : setDividindo(!dividindo))}
        >
          {dividindo ? "Cancelar" : "Dividir"}
        </button>
        <button type="button" className="bt" disabled={ocupado || indice === blocos.length - 1} onClick={() => onJuntar(indice)}>
          Juntar
        </button>
        <button type="button" className="bt perigo" disabled={ocupado} onClick={() => onExcluirBloco(indice)}>
          Excluir
        </button>
      </div>
    </div>
  );
};
