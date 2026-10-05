// Ajustes do bloco na folha do celular. Usa os campos do computador (palavras,
// layout, cor, som) e troca o resto pelo desenho da referência: posição em
// Cima / Meio / Baixo e Dividir / Juntar / Excluir lado a lado. As peças do
// computador que saem ficam escondidas em celular.css.
import {useEffect, useRef, useState} from "react";
import {PREDEFINICOES} from "../../../src/posicao";
import {AjustesDoBloco} from "../AjustesDoBloco";

type Props = React.ComponentProps<typeof AjustesDoBloco>;

// Nomes curtos da referência para as posições pré-definidas (na mesma ordem).
const NOMES_DAS_POSICOES = ["Cima", "Meio", "Baixo"];

export const AjustesDoBlocoCelular: React.FC<Props> = (props) => {
  const {indice, blocos, posicaoGeral, ocupado, onDividir, onJuntar, onExcluirBloco, onInicioPosicao, onPosicaoDoBloco} = props;
  const bloco = blocos[indice];
  // "Dividir" mostra os ✂ entre as palavras; tocar num deles divide ali.
  const [dividindo, setDividindo] = useState(false);
  const palavras = bloco?.words.length ?? 0;
  useEffect(() => setDividindo(false), [indice, palavras]);
  // O botão fica no fim da folha e os ✂ nas palavras, no topo: a folha rola até elas.
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dividindo) {
      raiz.current?.querySelector(".palavras-ajustes")?.scrollIntoView({block: "nearest", behavior: "smooth"});
    }
  }, [dividindo]);

  if (!bloco) {
    return <AjustesDoBloco {...props} />;
  }
  const posicao = bloco.posicao ?? posicaoGeral;

  return (
    <div ref={raiz} className={`cel-ajustes-bloco ${dividindo ? "cel-dividindo" : ""}`}>
      <AjustesDoBloco {...props} mostrarSoEsteBloco={false} />

      {dividindo ? <p className="cel-ajuda cel-ajuda-dividir">Toque no ✂ onde o bloco deve ser dividido</p> : null}

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
