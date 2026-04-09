export const APP_NAME = "Transcribble";

export const AUDIO_SAMPLE_RATE = 16_000;
export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
export const MAX_FILE_SIZE_LABEL = "200 MB";

export const SUPPORTED_EXTENSIONS = [".mp3", ".mp4", ".m4a", ".wav", ".mov"] as const;
export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.join(",");

export const VIDEO_EXTENSIONS = new Set<string>([".mp4", ".mov"]);
export const AUDIO_EXTENSIONS = new Set<string>([".mp3", ".m4a", ".wav"]);

export const FFMPEG_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

export type Runtime = "webgpu" | "wasm";

export const MODEL_ID = "onnx-community/whisper-base_timestamped";

export const RUNTIME_LABELS: Record<Runtime, string> = {
  webgpu: "Faster local browser runtime",
  wasm: "Standard local browser runtime",
};

export const MODEL_LABELS: Record<Runtime, string> = {
  webgpu: "Whisper base timestamped",
  wasm: "Whisper base timestamped (smaller local build)",
};

export const LOCAL_PROCESSING_NOTE =
  "Saved on this device. The first use downloads the local tools this browser needs.";
