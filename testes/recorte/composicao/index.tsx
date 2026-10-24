// Composição mínima do teste (só local, não vai para o site do Lambda):
//   1. o vídeo original (ou uma cor lisa, para enxergar a borda do recorte);
//   2. uma palavra grande branca;
//   3. a pessoa recortada por cima: a palavra fica atrás da cabeça;
//   4. uma segunda palavra NA FRENTE, com mix-blend-mode: color-dodge e filter: invert(1).
// Sem "recorte", a camada 3 sai (para medir o tempo extra de render).
import {AbsoluteFill, Composition, OffthreadVideo, registerRoot, staticFile} from "remotion";

export type Props = {
  base: string;
  recorte?: string;
  fundo?: string;
  atras: string;
  frente: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

const palavra = (largura: number): React.CSSProperties => ({
  fontFamily: "Arial Black, Arial, sans-serif",
  fontWeight: 900,
  fontSize: largura * 0.26,
  lineHeight: 1,
  color: "white",
  textAlign: "center",
  width: "100%",
  position: "absolute",
  left: 0,
});

const Recorte: React.FC<Props> = ({base, recorte, fundo, atras, frente, width}) => (
  <AbsoluteFill style={{backgroundColor: fundo ?? "black"}}>
    {fundo ? null : <OffthreadVideo src={staticFile(base)} />}
    <div style={{...palavra(width), top: "22%"}}>{atras}</div>
    {recorte ? (
      <AbsoluteFill>
        <OffthreadVideo src={staticFile(recorte)} transparent muted />
      </AbsoluteFill>
    ) : null}
    {/* Amostras da palavra da frente, cada uma com a cor escrita embaixo (sem mistura). */}
    <div style={{position: "absolute", top: "62%", left: 0, width: "100%", display: "flex", justifyContent: "space-evenly"}}>
      {AMOSTRAS.map(({nome, cor}) => (
        <div key={nome} style={{display: "flex", flexDirection: "column", alignItems: "center", gap: width * 0.01}}>
          <div style={{...palavra(width), ...corDoTexto(cor), position: "static", width: "auto", fontSize: width * 0.075, mixBlendMode: "color-dodge", filter: "invert(1)"}}>{frente}</div>
          <div style={{fontFamily: "Arial, sans-serif", fontSize: width * 0.022, color: "white", textAlign: "center", whiteSpace: "pre"}}>{nome}</div>
        </div>
      ))}
    </div>
  </AbsoluteFill>
);

// Cores da palavra da frente: como no "Dividir" do After Effects, a cor escura clareia o
// fundo (invertida, vira clara; o color-dodge clareia o vídeo por ela).
const AMOSTRAS = [
  {nome: "#404040", cor: "#404040"},
  {nome: "#808080", cor: "#808080"},
  {nome: "#b0b0b0", cor: "#b0b0b0"},
  {nome: "#7a3a10 →\n#3a1a5a", cor: "linear-gradient(90deg, #7a3a10, #3a1a5a)"},
  {nome: "#6a5010", cor: "#6a5010"},
];

// Cor lisa no color; degradê pelo fundo recortado no formato das letras.
const corDoTexto = (cor: string): React.CSSProperties =>
  cor.startsWith("linear-gradient") ? {backgroundImage: cor, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent"} : {color: cor};

const Raiz: React.FC = () => (
  <Composition
    id="Recorte"
    component={Recorte}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={1}
    defaultProps={{base: "", atras: "ATRÁS", frente: "FRENTE", width: 1080, height: 1920, fps: 30, durationInFrames: 1} as Props}
    calculateMetadata={({props}) => ({width: props.width, height: props.height, fps: props.fps, durationInFrames: props.durationInFrames})}
  />
);

registerRoot(Raiz);
