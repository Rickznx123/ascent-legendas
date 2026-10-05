import {useEffect, useLayoutEffect, useRef, useState} from "react";
import type {PlayerRef} from "@remotion/player";
import type {BlockTiming} from "../../src/tempos";
import type {AssignedCaptionBlock, EfeitoSonoro} from "../../src/types";
import {relogio, useQuadroDaPrevia} from "./quadro";

type Props = {
  playerRef: React.RefObject<PlayerRef | null>;
  // A prévia está na tela.
  ativo: boolean;
  fps: number;
  durationInFrames: number;
  video: string;
  blocos: AssignedCaptionBlock[];
  // Tempos de tela dos blocos (os mesmos do render).
  timeline: BlockTiming[];
  efeitos: EfeitoSonoro[];
  blocoSelecionado: number;
  onSelecionar: (bloco: number) => void;
};

// Zoom: quantas vezes a largura visível cabe na linha do tempo.
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];
// Intervalos possíveis entre as marcas da régua, em segundos.
const PASSOS_DA_REGUA = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
// Distância mínima entre duas marcas da régua, em px.
const ESPACO_ENTRE_MARCAS = 56;

const porcento = (ms: number, totalMs: number) => `${(Math.max(0, Math.min(ms, totalMs)) / totalMs) * 100}%`;

export const LinhaDoTempo: React.FC<Props> = ({
  playerRef,
  ativo,
  fps,
  durationInFrames,
  video,
  blocos,
  timeline,
  efeitos,
  blocoSelecionado,
  onSelecionar,
}) => {
  const {quadro, tocando} = useQuadroDaPrevia(playerRef, ativo);
  const [zoom, setZoom] = useState(0);
  const [larguraVisivel, setLarguraVisivel] = useState(0);
  const rolagem = useRef<HTMLDivElement>(null);
  const conteudo = useRef<HTMLDivElement>(null);
  const arrastandoRegua = useRef(false);

  const totalMs = Math.max(1, (durationInFrames / fps) * 1000);
  const fator = ZOOMS[zoom];
  const larguraTotal = larguraVisivel * fator;
  const agulhaPx = (quadro / Math.max(1, durationInFrames)) * larguraTotal;
  const revisar = blocos.filter((bloco) => bloco.review).length;

  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento) {
      return;
    }
    const observador = new ResizeObserver(() => setLarguraVisivel(elemento.clientWidth));
    observador.observe(elemento);
    setLarguraVisivel(elemento.clientWidth);
    return () => observador.disconnect();
  }, []);

  // Tocando: a agulha não sai da área visível.
  useEffect(() => {
    const elemento = rolagem.current;
    if (!elemento || !tocando || fator === 1) {
      return;
    }
    if (agulhaPx < elemento.scrollLeft || agulhaPx > elemento.scrollLeft + elemento.clientWidth - 24) {
      elemento.scrollLeft = Math.max(0, agulhaPx - 40);
    }
  }, [agulhaPx, tocando, fator]);

  // Zoom novo: mantém a agulha no meio da área visível.
  const agulhaAtual = useRef(agulhaPx);
  agulhaAtual.current = agulhaPx;
  useLayoutEffect(() => {
    const elemento = rolagem.current;
    if (elemento) {
      elemento.scrollLeft = Math.max(0, agulhaAtual.current - elemento.clientWidth / 2);
    }
  }, [fator]);

  // Clicar ou arrastar na régua move a prévia.
  const irPara = (clientX: number) => {
    const caixa = conteudo.current?.getBoundingClientRect();
    const player = playerRef.current;
    if (!caixa || !player || caixa.width === 0) {
      return;
    }
    const fracao = Math.max(0, Math.min(1, (clientX - caixa.left) / caixa.width));
    player.seekTo(Math.min(durationInFrames - 1, Math.round(fracao * durationInFrames)));
  };

  // Marcas da régua: o menor intervalo que deixa espaço entre elas.
  const pxPorSegundo = larguraTotal / (totalMs / 1000);
  const passo = PASSOS_DA_REGUA.find((segundos) => segundos * pxPorSegundo >= ESPACO_ENTRE_MARCAS) ?? 600;
  const marcas: number[] = [];
  if (larguraTotal > 0) {
    for (let segundos = 0; segundos * 1000 <= totalMs; segundos += passo) {
      marcas.push(segundos);
    }
  }

  return (
    <footer className="tempo" aria-label="Linha do tempo">
      <div className="ferramentas">
        <span className="suave pequeno">
          {blocos.length} blocos{revisar > 0 ? ` · ${revisar} para revisar` : ""}
        </span>
        <div className="cresce" />
        <span className="suave pequeno">Zoom {fator}×</span>
        <button
          type="button"
          className="ic"
          aria-label="Diminuir zoom"
          title="Diminuir zoom"
          disabled={zoom === 0}
          onClick={() => setZoom((atual) => Math.max(0, atual - 1))}
        >
          −
        </button>
        <button
          type="button"
          className="ic"
          aria-label="Aumentar zoom"
          title="Aumentar zoom"
          disabled={zoom === ZOOMS.length - 1}
          onClick={() => setZoom((atual) => Math.min(ZOOMS.length - 1, atual + 1))}
        >
          +
        </button>
      </div>

      <div className="trilhas">
        <div className="nomes" aria-hidden="true">
          <div className="nome-regua" />
          <div className="nome">Legendas</div>
          <div className="nome">Vídeo</div>
          <div className="nome nome-fino">Efeitos</div>
        </div>
        <div className="rolagem-tempo" ref={rolagem}>
          <div className="conteudo-tempo" ref={conteudo} style={{width: `${fator * 100}%`}}>
            <div
              className="regua"
              role="slider"
              tabIndex={ativo ? 0 : -1}
              aria-label="Posição da prévia"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalMs / 1000)}
              aria-valuenow={Math.round(quadro / fps)}
              aria-valuetext={relogio((quadro / fps) * 1000)}
              onPointerDown={(event) => {
                if (!ativo) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                arrastandoRegua.current = true;
                irPara(event.clientX);
              }}
              onPointerMove={(event) => arrastandoRegua.current && irPara(event.clientX)}
              onPointerUp={() => (arrastandoRegua.current = false)}
              onPointerCancel={() => (arrastandoRegua.current = false)}
              onKeyDown={(event) => {
                const player = playerRef.current;
                const passoTecla = event.shiftKey ? fps * 5 : fps;
                if (!player) return;
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  const delta = event.key === "ArrowLeft" ? -passoTecla : passoTecla;
                  player.seekTo(Math.max(0, Math.min(durationInFrames - 1, quadro + delta)));
                }
              }}
            >
              {marcas.map((segundos) => (
                <span key={segundos} style={{left: porcento(segundos * 1000, totalMs)}}>
                  {passo < 1 ? `${relogio(segundos * 1000)}.${Math.round((segundos % 1) * 10)}` : relogio(segundos * 1000)}
                </span>
              ))}
            </div>

            <div className="trilha">
              {blocos.map((bloco, indice) => {
                const tempo = timeline[indice];
                if (!tempo) return null;
                const texto = bloco.words.map((palavra) => palavra.text).join(" ");
                const classes = [
                  "clipe",
                  bloco.family === "destaque" ? "clipe-destaque" : "",
                  bloco.review ? "clipe-revisar" : "",
                  indice === blocoSelecionado ? "clipe-selecionado" : "",
                ].join(" ");
                return (
                  <button
                    key={`${bloco.startMs}-${indice}`}
                    type="button"
                    className={classes}
                    style={{
                      left: porcento(tempo.showMs, totalMs),
                      width: `max(3px, ${porcento(tempo.hideMs - tempo.showMs, totalMs)})`,
                    }}
                    title={`#${indice + 1} · ${texto}${bloco.review ? " · revisar" : ""}`}
                    aria-label={`Bloco ${indice + 1}: ${texto}`}
                    aria-current={indice === blocoSelecionado ? "true" : undefined}
                    onClick={() => onSelecionar(indice)}
                  >
                    {texto}
                  </button>
                );
              })}
            </div>

            <div className="trilha">
              {video ? <div className="fita" title={video}><span>{video}</span></div> : null}
            </div>

            <div className="trilha trilha-fina">
              {efeitos.map((efeito, indice) => (
                <button
                  key={`${efeito.startMs}-${indice}`}
                  type="button"
                  tabIndex={-1}
                  className="marca-som"
                  style={{
                    left: porcento(efeito.startMs, totalMs),
                    width: `max(4px, ${porcento(efeito.duracaoMs, totalMs)})`,
                  }}
                  title={`${efeito.arquivo.split("/").pop()} · bloco #${efeito.bloco + 1}`}
                  aria-label={`Efeito ${efeito.arquivo} no bloco ${efeito.bloco + 1}`}
                  onClick={() => onSelecionar(efeito.bloco)}
                />
              ))}
            </div>

            {ativo ? <div className="agulha" style={{left: `${agulhaPx}px`}} /> : null}
          </div>
        </div>
      </div>
    </footer>
  );
};
