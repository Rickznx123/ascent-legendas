import {execFile} from "node:child_process";
import {existsSync, readdirSync} from "node:fs";
import path from "node:path";
import {promisify} from "node:util";
import type {VideoMetadata} from "../types";

export const execFileAsync = promisify(execFile);

type ProbeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
};

type ProbeOutput = {
  streams?: ProbeStream[];
  format?: {duration?: string};
};

const findWindowsGyanBinary = (binaryName: string): string | undefined => {
  const packagesRoot = path.join(
    process.env.LOCALAPPDATA ?? "",
    "Microsoft",
    "WinGet",
    "Packages",
  );
  if (!existsSync(packagesRoot)) {
    return undefined;
  }

  for (const packageName of readdirSync(packagesRoot)) {
    if (!packageName.startsWith("Gyan.FFmpeg_")) {
      continue;
    }

    const packagePath = path.join(packagesRoot, packageName);
    for (const buildName of readdirSync(packagePath)) {
      const candidate = path.join(packagePath, buildName, "bin", binaryName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
};

const resolveExecutable = (name: "ffmpeg" | "ffprobe", override?: string): string => {
  const executableName = process.platform === "win32" ? `${name}.exe` : name;
  if (override && existsSync(override)) {
    return override;
  }

  const pathDirectories = (process.env.PATH ?? "").split(path.delimiter);
  for (const directory of pathDirectories) {
    const candidate = path.join(directory, executableName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform === "win32") {
    const linksCandidate = path.join(
      process.env.LOCALAPPDATA ?? "",
      "Microsoft",
      "WinGet",
      "Links",
      executableName,
    );
    if (existsSync(linksCandidate)) {
      return linksCandidate;
    }

    const packageCandidate = findWindowsGyanBinary(executableName);
    if (packageCandidate) {
      return packageCandidate;
    }
  }

  return name;
};

export const ffmpegPath = (): string => resolveExecutable("ffmpeg", process.env.FFMPEG_PATH);
export const ffprobePath = (): string => resolveExecutable("ffprobe", process.env.FFPROBE_PATH);

const parseFrameRate = (value: string | undefined): number => {
  if (!value) {
    throw new Error("O ffprobe não encontrou a taxa de quadros do vídeo.");
  }

  const [numerator, denominator = "1"] = value.split("/");
  const fps = Number(numerator) / Number(denominator);
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`Taxa de quadros inválida no vídeo: ${value}`);
  }

  return fps;
};

export const getVideoMetadata = async (inputPath: string): Promise<VideoMetadata> => {
  const {stdout} = await execFileAsync(ffprobePath(), [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,duration:format=duration",
    "-of",
    "json",
    inputPath,
  ]);
  const probe = JSON.parse(stdout) as ProbeOutput;
  const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
  if (!videoStream?.width || !videoStream.height) {
    throw new Error("Não encontrei uma faixa de vídeo válida no arquivo informado.");
  }

  const fps = parseFrameRate(videoStream.avg_frame_rate ?? videoStream.r_frame_rate);
  const durationSeconds = Number(videoStream.duration ?? probe.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Não foi possível descobrir a duração do vídeo.");
  }

  return {
    width: videoStream.width,
    height: videoStream.height,
    fps,
    durationInFrames: Math.ceil(durationSeconds * fps),
  };
};
