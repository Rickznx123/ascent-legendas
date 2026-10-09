// Aba Sons no celular, no desenho da aba Templates: chips Destaque / Linear (as
// pastas sons/destaque e sons/linear), cartões embaixo. Tocar num cartão toca uma
// amostra e marca o som para o bloco selecionado daquela família (sem bloco dela,
// para todos os da família); segurar marca para todos. Embaixo, quantos blocos tocam
// som e o volume. Nada muda no vídeo até "Aplicar"; sair da aba descarta o marcado.
import {useEffect, useRef, useState} from "react";
import {SEM_SOM, blocoPodeTerSom} from "../../../src/sons";
import type {ConfigEfeitos, FrequenciaSom} from "../../../src/sons";
import type {Projeto} from "../../../src/motor/projeto";
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

// Som marcado e ainda não aplicado: para um bloco ou (sem bloco) todos os da família.
type SomPendente = {opcao: Opcao; familia: TemplateFamily; bloco?: number};

// Quanto tempo "Sons aplicados" fica na tela.
const CONFIRMACAO_MS = 2000;

const segundos = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
const semPasta = (arquivo: string) => (arquivo.split("/").pop() ?? arquivo).replace(/\.[^.]+$/u, "");

export const SonsCelular: React.FC<{e: Editor}> = ({e}) => {
  const {blocos, estilo} = e;
  const indice = e.blocoSelecionado;
  const bloco = blocos[indice];
  const [familia, setFamilia] = useState<TemplateFamily>(bloco?.family ?? "destaque");
  const desativado = e.ocupado || !e.projetoDoVideo;
  // O marcado fica aqui até "Aplicar"; a aba fechada leva junto.
  const [somPendente, setSomPendente] = useState<SomPendente>();
  const [efeitosPendentes, setEfeitosPendentes] = useState<Partial<ConfigEfeitos>>({});
  const configEfeitos = {...e.configEfeitos, ...efeitosPendentes};
  const pendente = somPendente !== undefined || Object.keys(efeitosPendentes).length > 0;
  const [aplicado, setAplicado] = useState(false);
  const timerDoAplicado = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timerDoAplicado.current), []);

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
  const marcar = (opcao: Opcao, todos: boolean) =>
    setSomPendente({opcao, familia, bloco: todos || !blocoRecebe ? undefined : indice});

  // Uma mudança só no projeto: a prévia, o salvamento e a exportação usam a mesma.
  const aplicar = () => {
    const mudanca: Partial<Projeto> = {};
    if (Object.keys(efeitosPendentes).length > 0) {
      mudanca.efeitos = configEfeitos;
    }
    if (somPendente) {
      const {opcao, familia: daFamilia, bloco: soUm} = somPendente;
      mudanca.blocks = blocos.map((b, i) =>
        (soUm === undefined ? b.family === daFamilia && blocoPodeTerSom(b, estilo?.templates[b.template]) : i === soUm)
          ? {...b, som: opcao.valor}
          : b,
      );
    }
    // Como antes: o som dos blocos entra no desfazer; frequência e volume, não.
    if (mudanca.blocks) {
      e.editarProjeto(mudanca);
    } else {
      e.mudarEfeitos(efeitosPendentes);
    }
    setSomPendente(undefined);
    setEfeitosPendentes({});
    setAplicado(true);
    window.clearTimeout(timerDoAplicado.current);
    timerDoAplicado.current = window.setTimeout(() => setAplicado(false), CONFIRMACAO_MS);
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
            <b>Bloco #{indice + 1}</b> · toque ouve e marca para o bloco · segure para todos os de {familia}
          </>
        ) : (
          <>Toque ouve e marca para todos os blocos de {familia}</>
        )}
      </p>
      {arquivos.length === 0 ? (
        <p className="vazio">Nenhum som em sons/{familia}/. Coloque arquivos .wav ou .mp3 lá e recarregue em Ajustes.</p>
      ) : null}
      <div className="cel-cartoes" role="group" aria-label={`Sons de ${familia}`}>
        {opcoes.map((opcao) => {
          const doBloco = blocoRecebe ? blocoRecebe.som === opcao.valor : false;
          const marcado = somPendente?.familia === familia ? somPendente.opcao.valor === opcao.valor : doBloco;
          return (
            <CartaoSeguravel
              key={opcao.valor ?? "automatico"}
              rotulo={`${opcao.nome}${doBloco ? " (som do bloco)" : ""}`}
              marcado={marcado}
              desativado={desativado}
              onToque={() => {
                ouvir(opcao);
                marcar(opcao, false);
              }}
              onSegurar={() => marcar(opcao, true)}
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
            onClick={() => setEfeitosPendentes((atuais) => ({...atuais, [familia]: valor}))}
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
          onChange={(event) => setEfeitosPendentes((atuais) => ({...atuais, volume: Number(event.target.value)}))}
        />
      </div>
      <button type="button" className="bt primario cel-cheio" disabled={desativado || !pendente} onClick={aplicar}>
        Aplicar
      </button>
      <p className="cel-contexto" role="status">
        {aplicado ? "Sons aplicados" : null}
      </p>
    </div>
  );
};
