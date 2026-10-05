import {useEffect, useMemo, useRef, useState} from "react";
import {Player, Thumbnail} from "@remotion/player";
import {montarMiniatura, textoDoExemplo} from "../../src/galeria";
import type {Miniatura, TextoDaMiniatura} from "../../src/galeria";
import {KineticCaptionVideo} from "../../src/KineticCaptionVideo";
import {PACOTE_MISTO} from "../../src/motor/blocos";
import type {Estilo} from "../../src/motor/projeto";
import {layoutServeParaBloco} from "../../src/rhythm";
import type {PackageRules} from "../../src/rhythm";
import type {AssignedCaptionBlock, KineticCaptionVideoProps, Palette} from "../../src/types";

// Quadros por segundo das miniaturas (o vídeo não importa: o fundo é preto).
const FPS = 30;
const TODOS = "";

export type BlocoSelecionado = {
  indice: number;
  bloco: AssignedCaptionBlock;
  seguinte?: AssignedCaptionBlock;
  // Layout atual do bloco como na galeria ("d/d4").
  layout: string;
};

type Props = {
  // Estilo com todos os pacotes (modo misto): layouts "d/d4" e as regras de cada pacote.
  estilo: Estilo;
  // Paleta selecionada no momento.
  palette: Palette;
  paletas: Record<string, Palette>;
  largura: number;
  altura: number;
  selecionado?: BlocoSelecionado;
  // Pacote do vídeo (ou "misto").
  pacoteDoVideo: string;
  // Sem projeto ou com tarefa rodando: não dá para aplicar layouts nem sortear.
  ocupado: boolean;
  // Só com tarefa rodando fica falso: o pacote também vale para a próxima transcrição.
  podeTrocarPacote: boolean;
  onAplicarLayout: (chave: string) => void;
  onAplicarPacote: (pacote: string) => void;
  onSortear: () => void;
  onLimparSelecao: () => void;
};

type Item = {
  chave: string;
  nome: string;
  rules: PackageRules;
  inputProps: KineticCaptionVideoProps;
  miniatura: Miniatura;
  serve: boolean;
};

// Uma miniatura: desenhada só quando aparece na rolagem; com o mouse em cima (ou ao
// ser tocada com o dedo), a imagem parada vira um Player tocando a entrada do layout.
// Só uma miniatura toca por vez.
const Miniatura: React.FC<{
  item: Item;
  largura: number;
  altura: number;
  atual: boolean;
  podeAplicar: boolean;
  tocando: boolean;
  setTocando: (ligado: boolean) => void;
  onAplicar: () => void;
}> = ({item, largura, altura, atual, podeAplicar, tocando, setTocando, onAplicar}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) {
      return;
    }
    const observador = new IntersectionObserver(([entrada]) => setVisivel(entrada.isIntersecting), {rootMargin: "150px"});
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  const comum = {
    component: KineticCaptionVideo,
    inputProps: item.inputProps,
    durationInFrames: item.miniatura.duracaoEmQuadros,
    compositionWidth: largura,
    compositionHeight: altura,
    fps: FPS,
    style: {width: "100%", height: "100%"},
  };
  return (
    <button
      ref={ref}
      type="button"
      className={["mini", item.serve ? "" : "mini-nao-serve"].join(" ")}
      data-layout={item.chave}
      aria-pressed={atual}
      // Sem bloco selecionado a miniatura ainda toca ao passar o mouse; só não aplica.
      aria-disabled={!podeAplicar}
      title={
        !podeAplicar
          ? "Selecione um bloco na lista para aplicar este layout"
          : item.serve
            ? `Aplicar ${item.chave} ao bloco selecionado`
            : `Aplicar ${item.chave} (não segue as regras do pacote para este bloco)`
      }
      onMouseEnter={() => setTocando(true)}
      onMouseLeave={() => setTocando(false)}
      onFocus={() => setTocando(true)}
      onBlur={() => setTocando(false)}
      // Dedo ou caneta: sem "mouse em cima", o toque é que toca a animação.
      onPointerDown={(event) => event.pointerType !== "mouse" && setTocando(true)}
      onClick={() => podeAplicar && onAplicar()}
    >
      <span className="mini-quadro" style={{aspectRatio: `${largura} / ${altura}`}}>
        {visivel ? (
          tocando ? (
            <Player {...comum} autoPlay loop clickToPlay={false} initiallyMuted acknowledgeRemotionLicense />
          ) : (
            <Thumbnail {...comum} frameToDisplay={item.miniatura.quadroVisivel} />
          )
        ) : null}
      </span>
      <span className="mini-nome">{item.nome}</span>
    </button>
  );
};

export const Galeria: React.FC<Props> = ({
  estilo,
  palette,
  paletas,
  largura,
  altura,
  selecionado,
  pacoteDoVideo,
  ocupado,
  podeTrocarPacote,
  onAplicarLayout,
  onAplicarPacote,
  onSortear,
  onLimparSelecao,
}) => {
  const pacotes = useMemo(() => Object.values(estilo.pacotes), [estilo]);
  // Miniatura tocando a animação (uma por vez).
  const [tocando, setTocando] = useState<string>();
  // Chip escolhido: "Misto" mostra todos os pacotes. Começa no pacote do vídeo.
  const [aba, setAba] = useState(pacoteDoVideo === PACOTE_MISTO ? TODOS : pacoteDoVideo);
  const abaValida = aba === TODOS || pacotes.some((rules) => rules.name === aba) ? aba : TODOS;
  const pacoteDaAba = abaValida === TODOS ? PACOTE_MISTO : abaValida;
  const nomeDoPacote = (nome: string) => (nome === PACOTE_MISTO ? "Misto" : nome.toUpperCase());

  // Texto e regras de cada miniatura: as palavras do bloco selecionado ou o exemplo do pacote.
  const itens = useMemo(() => {
    const textoDoBloco: TextoDaMiniatura | undefined = selecionado
      ? {
          palavras: selecionado.bloco.words.map((word) => word.text),
          palavraChave: selecionado.bloco.keyword,
          seguinte: selecionado.seguinte
            ? {palavras: selecionado.seguinte.words.map((word) => word.text), palavraChave: selecionado.seguinte.keyword}
            : undefined,
        }
      : undefined;
    return pacotes.map((rules) => ({
      rules,
      itens: Object.entries(rules.templates).map(([nome, template]): Item => {
        const chave = rules.prefix + nome;
        const miniatura = montarMiniatura(chave, template, textoDoBloco ?? textoDoExemplo(rules.config.exemplo), FPS);
        return {
          chave,
          nome,
          rules,
          miniatura,
          serve: selecionado
            ? layoutServeParaBloco(nome, rules.templates, rules.config, selecionado.bloco, Boolean(selecionado.seguinte))
            : true,
          inputProps: {
            videoSrc: "",
            blocks: miniatura.blocks,
            templates: estilo.templates,
            palette,
            palettes: paletas,
            video: {width: largura, height: altura, fps: FPS, durationInFrames: miniatura.duracaoEmQuadros},
          },
        };
      }),
    }));
  }, [pacotes, selecionado, estilo.templates, palette, paletas, largura, altura]);

  const visiveis = itens.filter(({rules}) => abaValida === TODOS || rules.name === abaValida);
  // O modo misto só existe com mais de um pacote.
  const podeAplicarPacote =
    podeTrocarPacote && pacoteDoVideo !== pacoteDaAba && (pacoteDaAba !== PACOTE_MISTO || pacotes.length > 1);

  return (
    <div className="galeria">
      <div className="chips" role="group" aria-label="Pacotes">
        {[TODOS, ...pacotes.map((rules) => rules.name)].map((nome) => {
          const pacote = nome || PACOTE_MISTO;
          const emUso = pacote === pacoteDoVideo;
          return (
            <button
              key={pacote}
              type="button"
              className="chip"
              aria-pressed={abaValida === nome}
              title={emUso ? "Pacote usado no vídeo" : undefined}
              onClick={() => setAba(nome)}
            >
              {nomeDoPacote(pacote)}
              {emUso ? <span className="chip-uso" role="img" aria-label="em uso" /> : null}
            </button>
          );
        })}
      </div>

      <div className="acoes acoes-topo">
        <button type="button" className="bt" disabled={!podeAplicarPacote} onClick={() => onAplicarPacote(pacoteDaAba)}>
          {pacoteDoVideo === pacoteDaAba
            ? pacoteDaAba === PACOTE_MISTO
              ? "O vídeo já está no modo misto"
              : `O vídeo já usa o pacote ${nomeDoPacote(pacoteDaAba)}`
            : "Aplicar pacote ao vídeo inteiro"}
        </button>
        {pacoteDoVideo === PACOTE_MISTO ? (
          <button type="button" className="bt" disabled={ocupado} onClick={onSortear} title="Troca a semente do sorteio">
            Sortear de novo
          </button>
        ) : null}
      </div>

      <div className="galeria-contexto">
        {selecionado ? (
          <>
            <span>
              Bloco #{selecionado.indice + 1}: “{selecionado.bloco.words.map((word) => word.text).join(" ")}”
            </span>
            <button type="button" className="bt bt-p" onClick={onLimparSelecao}>
              Usar exemplo
            </button>
          </>
        ) : (
          <span>Texto de exemplo · clique num bloco da lista para ver as palavras dele e aplicar um layout</span>
        )}
      </div>

      {visiveis.map(({rules, itens: doPacote}) => (
        <section key={rules.name} aria-label={`Pacote ${rules.name.toUpperCase()}`}>
          {abaValida === TODOS ? <h3 className="titulo">Pacote {rules.name.toUpperCase()}</h3> : null}
          <div className="grade">
            {doPacote.map((item) => (
              <Miniatura
                key={item.chave}
                item={item}
                largura={largura}
                altura={altura}
                atual={selecionado?.layout === item.chave}
                podeAplicar={Boolean(selecionado) && !ocupado}
                tocando={tocando === item.chave}
                setTocando={(ligado) =>
                  setTocando((atual) => (ligado ? item.chave : atual === item.chave ? undefined : atual))
                }
                onAplicar={() => onAplicarLayout(item.chave)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
