import {Composition} from "remotion";
import {KineticCaptionVideo} from "./KineticCaptionVideo";
import type {KineticCaptionVideoProps} from "./types";

const defaultProps: KineticCaptionVideoProps = {
  videoSrc: "",
  blocks: [],
  templates: {},
  palette: {
    supportColor: "#ffffff",
    keywordFill: {type: "solida", color: "#ffffff"},
    glow: {inner: "rgba(255,255,255,.55)", outer: "rgba(255,255,255,.28)", intensity: 1},
    shadow: {color: "#000000"},
  },
  video: {width: 1080, height: 1920, fps: 30, durationInFrames: 1},
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="CaptionedVideo"
    component={KineticCaptionVideo}
    width={defaultProps.video.width}
    height={defaultProps.video.height}
    fps={defaultProps.video.fps}
    durationInFrames={defaultProps.video.durationInFrames}
    defaultProps={defaultProps}
    calculateMetadata={({props}) => ({
      width: props.video.width,
      height: props.video.height,
      fps: props.video.fps,
      durationInFrames: props.video.durationInFrames,
    })}
  />
);