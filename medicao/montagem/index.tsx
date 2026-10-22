// Composição de medição (plano dos takes), publicada como site à parte
// (medicao-montagem): monta o vídeo a partir de uma lista de trechos de takes.
// Com "audio", os vídeos ficam mudos e o som vem de um arquivo só, já juntado com
// os fades nos cortes (o mesmo áudio que vai para a transcrição).
import {Audio, Composition, OffthreadVideo, Series, registerRoot} from "remotion";

type Trecho = {src: string; deQuadro: number; quadros: number};
type Props = {trechos: Trecho[]; audio?: string};

const Montagem: React.FC<Props> = ({trechos, audio}) => (
  <>
    <Series>
      {trechos.map((t, i) => (
        <Series.Sequence key={i} durationInFrames={t.quadros}>
          <OffthreadVideo src={t.src} trimBefore={t.deQuadro} muted={Boolean(audio)} />
        </Series.Sequence>
      ))}
    </Series>
    {audio ? <Audio src={audio} /> : null}
  </>
);

const Raiz: React.FC = () => (
  <Composition
    id="Montagem"
    component={Montagem}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={1}
    defaultProps={{trechos: []} as Props}
    calculateMetadata={({props}) => ({durationInFrames: props.trechos.reduce((soma, t) => soma + t.quadros, 0)})}
  />
);

registerRoot(Raiz);
