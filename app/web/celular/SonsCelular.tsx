// Aba Sons no celular, no desenho da aba Templates: chips Destaque / Linear (as
// pastas sons/destaque e sons/linear), cartões embaixo. Tocar num cartão toca uma
// amostra e, com um bloco daquela família selecionado, aplica a ele; segurar aplica
// a todos os blocos da família. Embaixo, quantos blocos tocam som e o volume.
import {useState} from "react";
import {SEM_SOM, blocoPodeTerSom} from "../../../src/sons";
import type {FrequenciaSom} from "../../../src/sons";
import type {TemplateFamily} from "../../../src/types";
import type {Editor} from "../useEditor";
import {CartaoSeguravel} from "./CartaoSeguravel";

const FAMILIAS: {valor: TemplateFamily; nome: string}[] = [
  {valor: "destaque", nome: "Destaque"},
  {valor: "linear", nome: "Linear"},
];

const FREQUENCIAS: {valor: FrequenciaSom; nome: string}[] = [
  {valor: "nenhum", nome: "Nenhum"},
  {valor: "poucos", nome: "Poucos"},
  {valor: "metade", nome: "Metade"},
  {valor: "todos", nome: "Todos"},
];

// Opção de som de um bloco: undefined é o automático.
type Opcao = {valor: string | undefined; nome: string; arquivo?: string; duracaoMs?: number};

const segundos = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
const semPasta = (arquivo: string) => (arquivo.split("/").pop() ?? arquivo).replace(/\.[^.]+$/u, "");

export const SonsCelular: React.FC<{e: Editor; onAviso: (texto: string) => void}> = ({e, onAviso}) => {
  const {blocos, estilo, blocoAcoes, configEfeitos} = e;
  const indice = e.blocoSelecionado;
  const bloco = blocos[indice];
  const [familia, setFamilia] = useState<TemplateFamily>(bloco?.family ?? "destaque");
  const desativado = e.ocupado || !e.projetoDoVideo;

  const arquivos = e.sons.filter((som) => som.categoria === familia);
  const opcoes: Opcao[] = [
    {valor: undefined, nome: "Automático"},
    {valor: SEM_SOM, nome: "Sem som"},
    ...arquivos.map((som) => ({valor: som.arquivo, nome: semPasta(som.arquivo), arquivo: som.arquivo, duracaoMs: som.duracaoMs})),
  ];
  // O bloco selecionado recebe o som se for da família da aba e puder ter som.
  const blocoRecebe =
    bloco && bloco.family === familia && blocoPodeTerSom(bloco, estilo?.templates[bloco.template]) ? bloco : undefined;
  // Som que toca no bloco hoje (o automático sorteia um).
  const tocandoNoBloco = e.efeitos.find((efeito) => efeito.bloco === indice)?.arquivo;

  const ouvir = (opcao: Opcao) => {
    const arquivo = opcao.arquivo ?? (opcao.valor === undefined && blocoRecebe ? tocandoNoBloco : undefined);
    if (arquivo) {
      e.ouvirSom(arquivo);
    }
  };
  const aplicarEmTodos = (opcao: Opcao) => {
    let quantos = 0;
    const novos = blocos.map((b) => {
      if (b.family !== familia || !blocoPodeTerSom(b, estilo?.templates[b.template])) {
        return b;
      }
      quantos += 1;
      return {...b, som: opcao.valor};
    });
    e.editarProjeto({blocks: novos});
    onAviso(`${opcao.nome} em ${quantos} blocos de ${familia}`);
  };

  return (
    <div className="cel-aba-opcoes">
      <div className="chips" role="group" aria-label="Família dos sons">
        {FAMILIAS.map(({valor, nome}) => (
          <button key={valor} type="button" className="chip" aria-pressed={familia === valor} onClick={() => setFamilia(valor)}>
            {nome}
          </button>
        ))}
      </div>
      <p className="cel-contexto">
        {blocoRecebe ? (
          <>
            <b>Bloco #{indice + 1}</b> · toque ouve e aplica ao bloco · segure para todos os de {familia}
          </>
        ) : bloco && bloco.family !== familia ? (
          <>
            Bloco #{indice + 1} é {bloco.family}: toque só ouve · segure para todos os de {familia}
          </>
        ) : (
          <>Toque para ouvir · segure para usar em todos os blocos de {familia}</>
        )}
      </p>
      {arquivos.length === 0 ? (
        <p className="vazio">Nenhum som em sons/{familia}/. Coloque arquivos .wav ou .mp3 lá e recarregue em Ajustes.</p>
      ) : null}
      <div className="cel-cartoes" role="group" aria-label={`Sons de ${familia}`}>
        {opcoes.map((opcao) => {
          const doBloco = blocoRecebe ? blocoRecebe.som === opcao.valor : false;
          return (
            <CartaoSeguravel
              key={opcao.valor ?? "automatico"}
              rotulo={`${opcao.nome}${doBloco ? " (som do bloco)" : ""}`}
              marcado={doBloco}
              desativado={desativado}
              onToque={() => {
                ouvir(opcao);
                if (blocoRecebe) {
                  blocoAcoes.som(indice, opcao.valor);
                }
              }}
              onSegurar={() => aplicarEmTodos(opcao)}
            >
              <span className="cel-opcao-amostra cel-opcao-icone" aria-hidden="true">
                {opcao.valor === SEM_SOM ? "∅" : opcao.valor === undefined ? "♺" : "♪"}
              </span>
              <small className="cel-opcao-nome">{opcao.nome}</small>
              {opcao.duracaoMs !== undefined ? <em className="cel-opcao-selo">{segundos(opcao.duracaoMs)}</em> : null}
            </CartaoSeguravel>
          );
        })}
      </div>

      <div className="titulo">Som automático no {familia}</div>
      <div className="seg cel-seg" role="group" aria-label={`Quantos blocos de ${familia} tocam o som automático`}>
        {FREQUENCIAS.map(({valor, nome}) => (
          <button
            key={valor}
            type="button"
            disabled={desativado || arquivos.length === 0}
            aria-pressed={configEfeitos[familia] === valor}
            onClick={() => e.mudarEfeitos({[familia]: valor})}
          >
            {nome}
          </button>
        ))}
      </div>
      <div className="campo campo-deslizante">
        <label htmlFor="cel-som-volume">Volume: {configEfeitos.volume}%</label>
        <input
          id="cel-som-volume"
          type="range"
          min={0}
          max={100}
          step={5}
          value={configEfeitos.volume}
          disabled={desativado || e.sons.length === 0}
          onChange={(event) => e.mudarEfeitos({volume: Number(event.target.value)})}
        />
      </div>
    </div>
  );
};
