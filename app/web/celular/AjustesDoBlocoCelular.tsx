// Ajustes do bloco na folha do celular, no desenho da referência: palavras que editam
// com um toque, Destaque, Layout › e Som › (abrem a lista de opções dentro da folha),
// Cor numa linha só rolando para o lado, posição em Cima / Meio / Baixo (com "Usar
// posição geral") e Dividir / Juntar / Excluir lado a lado. Recebe as mesmas
// propriedades dos ajustes do computador.
import {Fragment, useEffect, useRef, useState} from "react";
import {findKeywordIndex} from "../../../src/captions";
import {keywordBackground} from "../../../src/KineticCaptionVideo";
import {PACOTE_MISTO} from "../../../src/motor/blocos";
import {PREDEFINICOES} from "../../../src/posicao";
import {SEM_SOM, blocoPodeTerSom, categoriaDoBloco} from "../../../src/sons";
import type {AjustesDoBloco} from "../AjustesDoBloco";
import {PalavraCelular} from "./PalavraCelular";

type Props = React.ComponentProps<typeof AjustesDoBloco>;

// Nomes curtos da referência para as posições pré-definidas (na mesma ordem).
const NOMES_DAS_POSICOES = ["Cima", "Meio", "Baixo"];

// Lista aberta por cima dos ajustes (Layout › ou Som ›).
type Lista = "layout" | "som";

const semPasta = (arquivo: string) => (arquivo.split("/").pop() ?? arquivo).replace(/\.[^.]+$/u, "");

export const AjustesDoBlocoCelular: React.FC<Props> = (props) => {
  const {indice, blocos, estilo, sons, efeitos, posicaoGeral, ocupado} = props;
  const {onTexto, onExcluirPalavra, onPalavraChave, onDividir, onLayout, onCor, onSom, onOuvir} = props;
  const {onJuntar, onExcluirBloco, onInicioPosicao, onPosicaoDoBloco, onPosicaoGeral} = props;
  const bloco = blocos[indice];
  // "Dividir" mostra os ✂ entre as palavras; tocar num deles divide ali.
  const [dividindo, setDividindo] = useState(false);
  const [lista, setLista] = useState<Lista>();
  const palavras = bloco?.words.length ?? 0;
  useEffect(() => {
    setDividindo(false);
    setLista(undefined);
  }, [indice, palavras]);
  // O botão fica no fim da folha e os ✂ nas palavras, no topo: a folha rola até elas.
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dividindo) {
      raiz.current?.querySelector(".cel-palavras-bloco")?.scrollIntoView({block: "nearest", behavior: "smooth"});
    }
  }, [dividindo]);
  // Ao abrir ou fechar uma lista, a folha volta para o topo.
  useEffect(() => {
    raiz.current?.closest(".cel-folha-conteudo")?.scrollTo({top: 0});
  }, [lista]);

  if (!bloco) {
    return <p className="vazio">Escolha um bloco na lista.</p>;
  }
  const posicao = bloco.posicao ?? posicaoGeral;
  const chave = findKeywordIndex(bloco.words, bloco.keyword);
  const misto = estilo.pacote === PACOTE_MISTO;
  const template = estilo.templates[bloco.template];
  const familiaDoLayout = (nome: string) => {
    const t = estilo.templates[nome];
    return t ? (t.structure === "dupla" ? "dupla" : t.family) : "";
  };
  const podeTerSom = blocoPodeTerSom(bloco, template);
  const tocando = efeitos.find((efeito) => efeito.bloco === indice)?.arquivo;
  const nomeDoSom = !bloco.som
    ? `Automático${tocando ? ` (${semPasta(tocando)})` : " (sem som)"}`
    : bloco.som === SEM_SOM
      ? "Sem som"
      : semPasta(bloco.som);

  // ---------- lista de opções (Layout › ou Som ›) ----------
  if (lista) {
    const voltar = (
      <button type="button" className="cel-lista-voltar" onClick={() => setLista(undefined)}>
        ‹ {lista === "layout" ? "Layout" : "Som"}
      </button>
    );
    if (lista === "layout") {
      const grupos = misto
        ? Object.values(estilo.pacotes).map((rules) => ({
            titulo: `Pacote ${rules.name.toUpperCase()}`,
            nomes: Object.keys(rules.templates).map((nome) => ({chave: rules.prefix + nome, rotulo: nome})),
          }))
        : [{titulo: "", nomes: Object.keys(estilo.templates).map((nome) => ({chave: nome, rotulo: nome}))}];
      return (
        <div ref={raiz} className="cel-ajustes-bloco">
          {voltar}
          {grupos.map((grupo) => (
            <section key={grupo.titulo || "layouts"} aria-label={grupo.titulo || "Layouts"}>
              {grupo.titulo ? <div className="titulo">{grupo.titulo}</div> : null}
              <div className="cel-opcoes-lista" role="radiogroup" aria-label="Layout do bloco">
                {grupo.nomes.map(({chave: nomeDoLayout, rotulo}) => (
                  <button
                    key={nomeDoLayout}
                    type="button"
                    role="radio"
                    className="cel-linha-opcao"
                    aria-checked={bloco.template === nomeDoLayout}
                    disabled={ocupado}
                    onClick={() => {
                      onLayout(indice, nomeDoLayout);
                      setLista(undefined);
                    }}
                  >
                    <span>{rotulo}</span>
                    <small>{familiaDoLayout(nomeDoLayout)}</small>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      );
    }
    const arquivos = sons.filter((som) => som.categoria === categoriaDoBloco(bloco));
    const opcoes: {valor: string | undefined; rotulo: string; arquivo?: string}[] = [
      {valor: undefined, rotulo: `Automático${tocando ? ` (${semPasta(tocando)})` : ""}`, arquivo: tocando},
      {valor: SEM_SOM, rotulo: "Sem som"},
      ...arquivos.map((som) => ({valor: som.arquivo, rotulo: semPasta(som.arquivo), arquivo: som.arquivo})),
    ];
    return (
      <div ref={raiz} className="cel-ajustes-bloco">
        {voltar}
        <div className="cel-opcoes-lista" role="radiogroup" aria-label={`Som do bloco ${indice + 1}`}>
          {opcoes.map((opcao) => (
            <div key={opcao.valor ?? "automatico"} className="cel-linha-com-ouvir">
              <button
                type="button"
                role="radio"
                className="cel-linha-opcao"
                aria-checked={bloco.som === opcao.valor}
                disabled={ocupado}
                onClick={() => {
                  onSom(indice, opcao.valor);
                  setLista(undefined);
                }}
              >
                <span>{opcao.rotulo}</span>
              </button>
              <button
                type="button"
                className="cel-ic"
                disabled={!opcao.arquivo}
                aria-label={`Ouvir ${opcao.rotulo}`}
                onClick={() => opcao.arquivo && onOuvir(opcao.arquivo)}
              >
                ▶
              </button>
            </div>
          ))}
        </div>
        {arquivos.length === 0 ? <p className="cel-ajuda">Nenhum arquivo em sons/{categoriaDoBloco(bloco)}/.</p> : null}
      </div>
    );
  }

  // ---------- ajustes ----------
  return (
    <div ref={raiz} className={`cel-ajustes-bloco ${dividindo ? "cel-dividindo" : ""}`}>
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
              onExcluir={() => onExcluirPalavra(indice, posicaoNaFrase)}
            />
          </Fragment>
        ))}
      </div>

      {dividindo ? <p className="cel-ajuda">Toque no ✂ onde o bloco deve ser dividido</p> : null}

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

      <button type="button" className="campo cel-campo-abre" disabled={ocupado} onClick={() => setLista("layout")}>
        <span className="rotulo">Layout</span>
        <span className="valor">
          {bloco.template} ({familiaDoLayout(bloco.template)}) ›
        </span>
      </button>

      <div className="campo cel-campo-cor">
        <span className="rotulo">Cor</span>
        <span className="cel-cores-linha" role="radiogroup" aria-label={`Cor do bloco ${indice + 1}`}>
          <button
            type="button"
            role="radio"
            aria-checked={!bloco.paleta}
            className="bolinha bolinha-padrao"
            title="Padrão (cor do vídeo)"
            disabled={ocupado}
            onClick={() => onCor(indice, undefined)}
          >
            padrão
          </button>
          {Object.keys(estilo.paletas).map((nome) => (
            <button
              key={nome}
              type="button"
              role="radio"
              aria-checked={bloco.paleta === nome}
              aria-label={nome}
              title={nome}
              className="bolinha"
              disabled={ocupado}
              style={{background: keywordBackground(estilo.paletas[nome])}}
              onClick={() => onCor(indice, nome)}
            />
          ))}
        </span>
      </div>

      {podeTerSom ? (
        <button type="button" className="campo cel-campo-abre" disabled={ocupado} onClick={() => setLista("som")}>
          <span className="rotulo">Som</span>
          <span className="valor">{nomeDoSom} ›</span>
        </button>
      ) : (
        <div className="campo">
          <span className="rotulo">Som</span>
          <span className="suave">Este layout não tem som</span>
        </div>
      )}

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
        {bloco.posicao ? (
          <button
            type="button"
            className="cel-link"
            disabled={ocupado}
            title="O bloco volta para a posição geral do vídeo"
            onClick={() => onPosicaoGeral(indice)}
          >
            Usar posição geral
          </button>
        ) : null}
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
