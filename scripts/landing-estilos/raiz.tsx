// Composição só dos clipes de "Estilos de legenda" (veja scripts/landing-estilos.ts):
// o motor de sempre por cima do degradê do cartão da página de apresentação.
import {AbsoluteFill, Composition, registerRoot} from "remotion";
import {KineticCaptionVideo} from "../../src/KineticCaptionVideo";
import type {KineticCaptionVideoProps} from "../../src/types";

// O mesmo degradê de .amostra em app/web/apresentacao.css.
const DEGRADE = "linear-gradient(180deg, #17133a, #08061c)";

const ClipeDoEstilo: React.FC<KineticCaptionVideoProps> = (props) => (
  <AbsoluteFill className="clipe-do-estilo" style={{background: DEGRADE}}>
    {/* Sem vídeo, o motor pinta o fundo de preto: aqui ele fica transparente. */}
    <style>{".clipe-do-estilo > div { background: transparent !important; }"}</style>
    <KineticCaptionVideo {...props} />
  </AbsoluteFill>
);

const Raiz: React.FC = () => (
  <Composition
    id="ClipeDoEstilo"
    component={ClipeDoEstilo}
    width={480}
    height={600}
    fps={30}
    durationInFrames={1}
    defaultProps={{} as KineticCaptionVideoProps}
    calculateMetadata={({props}) => ({
      width: props.video.width,
      height: props.video.height,
      fps: props.video.fps,
      durationInFrames: props.video.durationInFrames,
    })}
  />
);

registerRoot(Raiz);
