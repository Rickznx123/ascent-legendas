import {keywordBackground} from "../../src/KineticCaptionVideo";
import type {ArquivoSom, ConfigEfeitos, FrequenciaSom} from "../../src/sons";
import type {Palette} from "../../src/types";
import {Abas, PainelDaAba} from "./Abas";
import type {Aba} from "./Abas";
import {relogio} from "./quadro";

export const ABAS_ESQUERDA = ["midia", "templates", "cores", "sons"] as const;
export type AbaEsquerda = (typeof ABAS_ESQUERDA)[number];

const ABAS: Aba<AbaEsquerda>[] = [
  {valor: "midia", nome: "Mídia"},
  {valor: "templates", nome: "Templates"},
  {valor: "cores", nome: "Cores"},
  {valor: "sons", nome: "Sons"},
];

const FREQUENCIAS: {valor: FrequenciaSom; rotulo: string}[] = [
  {valor: "nenhum", rotulo: "Nenhum"},
  {valor: "poucos", rotulo: "Poucos (1 a cada 3)"},
  {valor: "metade", rotulo: "Metade"},
  {valor: "todos", rotulo: "Todos"},
];

type Props = {
  aba: AbaEsquerda;
  onAba: (aba: AbaEsquerda) => void;
  ocupado: boolean;
  temProjeto: boolean;
  // Mídia
  videos: string[];
  video: string;
  // Duração e blocos do vídeo aberto.
  duracaoMs?: number;
  quantosBlocos?: number;
  arrastando: boolean;
  onImportar: () => void;
  onVideo: (nome: string) => void;
  // Apaga a transcrição e as edições do vídeo e transcreve de novo (pede confirmação).
  onRecomecar: () => void;
  // Tira o vídeo da lista e apaga a transcrição dele (pede confirmação).
  onRemoverVideo: () => void;
  // Templates: a galeria já montada.
  galeria: React.ReactNode;
  // Cores
  paletas: string[];
  paleta: string;
  coresDasPaletas: Record<string, Palette>;
  blocosComCor: number;
  onPaleta: (nome: string) => void;
  onLimparCores: () => void;
  // Sons (cada controle fica desativado sem arquivos na subpasta dele).
  sons: ArquivoSom[];
  efeitos: ConfigEfeitos;
  onEfeitos: (mudanca: Partial<ConfigEfeitos>) => void;
  onOuvir: (arquivo: string) => void;
};

const segundos = (ms: number) => `${(ms / 1000).toFixed(2).replace(".", ",")} s`;

export const PainelEsquerdo: React.FC<Props> = (props) => {
  const {aba, onAba} = props;
  return (
    <aside className="esq" aria-label="Biblioteca">
      <Abas id="esq" rotulo="Biblioteca" abas={ABAS} atual={aba} onTrocar={onAba} />
      <PainelDaAba id="esq" atual={aba}>
        {aba === "midia" ? <Midia {...props} /> : null}
        {aba === "templates" ? props.galeria : null}
        {aba === "cores" ? <Cores {...props} /> : null}
        {aba === "sons" ? <Sons {...props} /> : null}
      </PainelDaAba>
    </aside>
  );
};

function Midia(props: Props) {
  const {videos, video, duracaoMs, quantosBlocos, arrastando, ocupado, temProjeto} = props;
  const {onImportar, onVideo, onRecomecar, onRemoverVideo} = props;
  return (
    <>
      <button
        type="button"
        className={`solta ${arrastando ? "solta-ativa" : ""}`}
        disabled={ocupado}
        onClick={onImportar}
      >
        <b>Importar vídeo</b>
        Arraste o arquivo para a janela ou clique para escolher
      </button>
      <div className="titulo">Vídeos</div>
      {videos.length === 0 ? <p className="vazio">Nenhum vídeo na pasta do projeto.</p> : null}
      <div className="lista-arquivos" role="group" aria-label="Vídeos">
        {videos.map((nome) => (
          <button
            key={nome}
            type="button"
            className="arq"
            aria-pressed={nome === video}
            disabled={ocupado}
            onClick={() => onVideo(nome)}
          >
            <i aria-hidden="true" />
            <span className="arq-texto">
              <b>{nome}</b>
              {nome === video ? (
                <small>
                  {duracaoMs !== undefined ? relogio(duracaoMs) : "…"}
                  {quantosBlocos !== undefined ? ` · ${quantosBlocos} blocos` : " · não transcrito"}
                </small>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      <div className="acoes">
        <button
          type="button"
          className="bt"
          disabled={ocupado || !video || !temProjeto}
          onClick={onRecomecar}
          title="Apaga a transcrição e todas as edições deste vídeo e transcreve de novo"
        >
          Recomeçar do zero
        </button>
        <button
          type="button"
          className="bt perigo"
          disabled={ocupado || !video}
          onClick={onRemoverVideo}
          title="Tira o vídeo da lista (vai para removidos/) e apaga a transcrição dele"
        >
          Remover vídeo
        </button>
      </div>
    </>
  );
}

export function Cores({
  paletas,
  paleta,
  coresDasPaletas,
  blocosComCor,
  ocupado,
  onPaleta,
  onLimparCores,
}: Pick<Props, "paletas" | "paleta" | "coresDasPaletas" | "blocosComCor" | "ocupado" | "onPaleta" | "onLimparCores">) {
  return (
    <>
      <div className="titulo">
        Cor do vídeo{paleta ? ` · ${paleta}` : ""}
      </div>
      <div className="cores" role="radiogroup" aria-label="Paleta do vídeo">
        {paletas.map((nome) => (
          <button
            key={nome}
            type="button"
            role="radio"
            className="cor"
            aria-checked={nome === paleta}
            aria-label={nome}
            title={nome}
            disabled={ocupado}
            style={coresDasPaletas[nome] ? {background: keywordBackground(coresDasPaletas[nome])} : undefined}
            onClick={() => onPaleta(nome)}
          >
            {coresDasPaletas[nome] ? null : <span className="cor-nome">{nome}</span>}
          </button>
        ))}
      </div>
      <div className="acoes">
        <button
          type="button"
          className="bt"
          disabled={blocosComCor === 0}
          onClick={onLimparCores}
          title="Todos os blocos voltam para a paleta geral"
        >
          Limpar cores dos blocos{blocosComCor > 0 ? ` (${blocosComCor})` : ""}
        </button>
      </div>
    </>
  );
}

export function Sons({
  sons,
  efeitos,
  ocupado,
  temProjeto,
  onEfeitos,
  onOuvir,
}: Pick<Props, "sons" | "efeitos" | "ocupado" | "temProjeto" | "onEfeitos" | "onOuvir">) {
  return (
    <>
      {(["destaque", "linear"] as const).map((familia) => {
        const tem = sons.some((som) => som.categoria === familia);
        return (
          <div key={familia} className="campo" title={tem ? undefined : `Coloque arquivos .wav ou .mp3 em sons/${familia}/`}>
            <label htmlFor={`som-${familia}`}>Som no {familia}</label>
            <select
              id={`som-${familia}`}
              className="sel"
              value={efeitos[familia]}
              disabled={ocupado || !tem || !temProjeto}
              onChange={(event) => onEfeitos({[familia]: event.target.value as FrequenciaSom})}
            >
              {FREQUENCIAS.map(({valor, rotulo}) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      <div className="campo">
        <label htmlFor="som-volume">Volume dos efeitos: {efeitos.volume}%</label>
        <input
          id="som-volume"
          type="range"
          className="faixa-volume"
          min={0}
          max={100}
          step={5}
          value={efeitos.volume}
          disabled={ocupado || sons.length === 0 || !temProjeto}
          onChange={(event) => onEfeitos({volume: Number(event.target.value)})}
        />
      </div>
      {sons.length === 0 ? (
        <p className="ajuda">
          Sem efeitos sonoros: coloque .wav ou .mp3 em sons/destaque/ e sons/linear/ e clique em Geral › Recarregar templates.
        </p>
      ) : null}
      {(["destaque", "linear"] as const).map((familia) => {
        const daFamilia = sons.filter((som) => som.categoria === familia);
        return daFamilia.length > 0 ? (
          <section key={familia} aria-label={`Sons do ${familia}`}>
            <div className="titulo">{familia === "destaque" ? "Destaque" : "Linear"}</div>
            {daFamilia.map((som) => (
              <div key={som.arquivo} className="linha-som">
                <button
                  type="button"
                  className="ic"
                  aria-label={`Ouvir ${som.arquivo}`}
                  title={`Ouvir ${som.arquivo}`}
                  onClick={() => onOuvir(som.arquivo)}
                >
                  ▶
                </button>
                <span>{som.arquivo.split("/").pop()}</span>
                <small>{segundos(som.duracaoMs)}</small>
              </div>
            ))}
          </section>
        ) : null;
      })}
    </>
  );
}
