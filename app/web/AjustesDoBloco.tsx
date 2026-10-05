import {findKeywordIndex} from "../../src/captions";
import {keywordBackground} from "../../src/KineticCaptionVideo";
import {PACOTE_MISTO} from "../../src/motor/blocos";
import type {Estilo} from "../../src/motor/projeto";
import type {Posicao} from "../../src/posicao";
import {SEM_SOM, blocoPodeTerSom, categoriaDoBloco} from "../../src/sons";
import type {ArquivoSom} from "../../src/sons";
import type {BlockTiming} from "../../src/tempos";
import type {AssignedCaptionBlock, EfeitoSonoro} from "../../src/types";
import {ControlesDePosicao} from "./ControlesDePosicao";
import {Palavra, SelosDoBloco} from "./ListaDeBlocos";
import {tempoDoBloco} from "./quadro";

type Props = {
  indice: number;
  blocos: AssignedCaptionBlock[];
  timeline: BlockTiming[];
  estilo: Estilo;
  // Efeitos sonoros: arquivos de sons/ e o que vai tocar em cada bloco.
  sons: ArquivoSom[];
  efeitos: EfeitoSonoro[];
  posicaoGeral: Posicao;
  // "Mover legenda" mexe só neste bloco.
  soEsteBloco: boolean;
  // Mostra a opção "Mover legenda só neste bloco" (no celular, a folha do bloco já
  // move só o bloco).
  mostrarSoEsteBloco?: boolean;
  ocupado: boolean;
  onSoEsteBloco: (ligado: boolean) => void;
  onTexto: (bloco: number, palavra: number, texto: string) => void;
  onPalavraChave: (bloco: number, palavra: number) => void;
  onExcluirPalavra: (bloco: number, palavra: number) => void;
  onDividir: (bloco: number, antesDaPalavra: number) => void;
  onLayout: (bloco: number, layout: string) => void;
  onCor: (bloco: number, paleta: string | undefined) => void;
  onSom: (bloco: number, som: string | undefined) => void;
  onOuvir: (arquivo: string) => void;
  // Bloco com posição própria volta para a posição geral.
  onPosicaoGeral: (bloco: number) => void;
  // Controles deslizantes: dão ao bloco uma posição própria (o mesmo valor do arrasto).
  onInicioPosicao: () => void;
  onPosicaoDoBloco: (bloco: number, posicao: Posicao) => void;
  onJuntar: (bloco: number) => void;
  onRevisar: (bloco: number) => void;
  onExcluirBloco: (bloco: number) => void;
};

const AUTOMATICO = "";

// Menu de som de um bloco: automático, sem som ou um arquivo da categoria do bloco
// (sons/destaque/ ou sons/linear/); ▶ ouve o som que vai tocar.
const MenuDeSom: React.FC<{
  bloco: AssignedCaptionBlock;
  indice: number;
  sons: ArquivoSom[];
  tocando?: string;
  onSom: (som: string | undefined) => void;
  onOuvir: (arquivo: string) => void;
}> = ({bloco, indice, sons, tocando, onSom, onOuvir}) => {
  const categoria = categoriaDoBloco(bloco);
  const arquivos = sons.filter((som) => som.categoria === categoria);
  const semNome = (arquivo: string) => arquivo.split("/").pop() ?? arquivo;
  // Arquivo escolhido que não está na categoria (sumiu, ou o bloco mudou de família): vale o automático.
  const foraDaCategoria = bloco.som && bloco.som !== SEM_SOM && !arquivos.some((som) => som.arquivo === bloco.som);
  return (
    <span className="controle-som">
      <select
        className="sel"
        value={bloco.som ?? AUTOMATICO}
        disabled={arquivos.length === 0}
        aria-label={`Som do bloco ${indice + 1}`}
        title={arquivos.length === 0 ? `Coloque arquivos .wav ou .mp3 em sons/${categoria}/` : `Efeito sonoro (sons/${categoria}/)`}
        onChange={(event) => onSom(event.target.value === AUTOMATICO ? undefined : event.target.value)}
      >
        <option value={AUTOMATICO}>
          Automático{!bloco.som ? (tocando ? ` (${semNome(tocando)})` : " (sem som)") : ""}
        </option>
        <option value={SEM_SOM}>Sem som</option>
        {foraDaCategoria ? <option value={bloco.som}>{semNome(bloco.som!)} (indisponível: automático)</option> : null}
        {arquivos.map((som) => (
          <option key={som.arquivo} value={som.arquivo}>
            {semNome(som.arquivo)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="ic"
        disabled={!tocando}
        title={tocando ? `Ouvir ${tocando}` : "Este bloco não tem som"}
        aria-label={`Ouvir o som do bloco ${indice + 1}`}
        onClick={() => tocando && onOuvir(tocando)}
      >
        ▶
      </button>
    </span>
  );
};

export const AjustesDoBloco: React.FC<Props> = ({
  indice,
  blocos,
  timeline,
  estilo,
  sons,
  efeitos,
  posicaoGeral,
  soEsteBloco,
  mostrarSoEsteBloco = true,
  ocupado,
  onSoEsteBloco,
  onTexto,
  onPalavraChave,
  onExcluirPalavra,
  onDividir,
  onLayout,
  onCor,
  onSom,
  onOuvir,
  onPosicaoGeral,
  onInicioPosicao,
  onPosicaoDoBloco,
  onJuntar,
  onRevisar,
  onExcluirBloco,
}) => {
  const bloco = blocos[indice];
  if (!bloco) {
    return <p className="vazio">Clique num bloco da lista ou da linha do tempo para ajustar.</p>;
  }
  const chave = findKeywordIndex(bloco.words, bloco.keyword);
  const layouts = Object.keys(estilo.templates);
  const misto = estilo.pacote === PACOTE_MISTO;
  const paletas = Object.keys(estilo.paletas);
  const tocando = efeitos.find((efeito) => efeito.bloco === indice)?.arquivo;
  const opcaoLayout = (nome: string, rotulo: string) => (
    <option key={nome} value={nome}>
      {rotulo} ({estilo.templates[nome].structure === "dupla" ? "dupla" : estilo.templates[nome].family})
    </option>
  );

  return (
    <>
      <div className="titulo titulo-linha">
        <span>
          Bloco #{indice + 1} · {tempoDoBloco(timeline[indice]?.showMs ?? bloco.startMs)}
        </span>
        <SelosDoBloco bloco={bloco} />
      </div>

      <div className="palavras palavras-ajustes">
        {bloco.words.map((palavra, posicao) => (
          <span key={`${palavra.startMs}-${posicao}`} className="palavra-grupo">
            {posicao > 0 ? (
              <button
                type="button"
                className="dividir"
                title="Dividir o bloco aqui"
                aria-label={`Dividir o bloco ${indice + 1} antes de "${palavra.text}"`}
                onClick={() => onDividir(indice, posicao)}
              >
                ✂
              </button>
            ) : null}
            <Palavra
              texto={palavra.text}
              chave={posicao === chave}
              rotulo={`Palavra ${posicao + 1} do bloco ${indice + 1}`}
              onDestacar={() => onPalavraChave(indice, posicao)}
              onEditar={(texto) => onTexto(indice, posicao, texto)}
              onExcluir={() => onExcluirPalavra(indice, posicao)}
            />
          </span>
        ))}
      </div>
      <p className="ajuda">Clique para destacar · duplo clique para editar · ✂ divide o bloco naquele ponto</p>

      <div className="campo">
        <label htmlFor="ajuste-layout">Layout</label>
        <select id="ajuste-layout" className="sel" value={bloco.template} onChange={(event) => onLayout(indice, event.target.value)}>
          {layouts.includes(bloco.template) ? null : <option value={bloco.template}>{bloco.template}</option>}
          {misto
            ? Object.values(estilo.pacotes).map((rules) => (
                <optgroup key={rules.name} label={`Pacote ${rules.name}`}>
                  {Object.keys(rules.templates).map((nome) => opcaoLayout(rules.prefix + nome, nome))}
                </optgroup>
              ))
            : layouts.map((nome) => opcaoLayout(nome, nome))}
        </select>
      </div>

      <div className="campo">
        <span className="rotulo">Cor</span>
        <span className="bolinhas" role="radiogroup" aria-label={`Cor do bloco ${indice + 1}`}>
          <button
            type="button"
            role="radio"
            aria-checked={!bloco.paleta}
            className="bolinha bolinha-padrao"
            title="Padrão (paleta geral do vídeo)"
            onClick={() => onCor(indice, undefined)}
          >
            padrão
          </button>
          {paletas.map((nome) => (
            <button
              key={nome}
              type="button"
              role="radio"
              aria-checked={bloco.paleta === nome}
              aria-label={nome}
              title={nome}
              className="bolinha"
              style={{background: keywordBackground(estilo.paletas[nome])}}
              onClick={() => onCor(indice, nome)}
            />
          ))}
        </span>
      </div>

      <div className="campo">
        <span className="rotulo">Som</span>
        {blocoPodeTerSom(bloco, estilo.templates[bloco.template]) ? (
          <MenuDeSom
            bloco={bloco}
            indice={indice}
            sons={sons}
            tocando={tocando}
            onSom={(som) => onSom(indice, som)}
            onOuvir={onOuvir}
          />
        ) : (
          <span className="suave">Este layout não tem som</span>
        )}
      </div>

      <div className="campo">
        <span className="rotulo">Posição</span>
        <span className="campo-direita">
          {bloco.posicao ? (
            <span>
              Própria ({bloco.posicao.x}% × {bloco.posicao.y}%)
            </span>
          ) : (
            <span className="suave">
              Geral ({posicaoGeral.x}% × {posicaoGeral.y}%)
            </span>
          )}
          <button
            type="button"
            className="bt bt-p"
            disabled={!bloco.posicao}
            title="O bloco volta para a posição geral do vídeo"
            onClick={() => onPosicaoGeral(indice)}
          >
            Usar posição geral
          </button>
        </span>
      </div>
      <ControlesDePosicao
        id="bloco-posicao"
        posicao={bloco.posicao ?? posicaoGeral}
        desativado={ocupado}
        onInicio={onInicioPosicao}
        onMudar={(posicao) => onPosicaoDoBloco(indice, posicao)}
      />
      {mostrarSoEsteBloco ? (
        <div className="campo">
          <label htmlFor="ajuste-so-este">Mover legenda só neste bloco</label>
          <input
            id="ajuste-so-este"
            type="checkbox"
            checked={soEsteBloco}
            disabled={ocupado}
            onChange={(event) => onSoEsteBloco(event.target.checked)}
          />
        </div>
      ) : null}

      <div className="acoes">
        <button type="button" className="bt" disabled={indice === blocos.length - 1} onClick={() => onJuntar(indice)}>
          Juntar com o seguinte
        </button>
        <button type="button" className="bt" onClick={() => onRevisar(indice)}>
          {bloco.review ? "Revisado" : "Marcar para revisar"}
        </button>
        <button
          type="button"
          className="bt perigo"
          title="Excluir o bloco (fica em Geral › Blocos excluídos)"
          onClick={() => onExcluirBloco(indice)}
        >
          Excluir bloco
        </button>
      </div>
    </>
  );
};
