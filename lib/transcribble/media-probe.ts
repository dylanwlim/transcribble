export interface MediaProbeData {
  format?: {
    duration?: string;
  };
  streams?: Array<{
    index?: number;
    codec_type?: string;
  }>;
}

export class MediaProbeError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MediaProbeError";
    this.code = code;
  }
}

export function assertUsableAudioStream(probe: MediaProbeData) {
  const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
  if (!audioStream || typeof audioStream.index !== "number") {
    throw new MediaProbeError(
      "no_audio_track",
      "This recording does not contain a usable audio stream.",
    );
  }

  const durationSec = Number(probe.format?.duration ?? 0);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new MediaProbeError(
      "invalid_duration",
      "This recording does not report a usable duration.",
    );
  }

  return {
    audioStreamIndex: audioStream.index,
    durationSec,
  };
}
