export const APP_NAME = "Transcribble";

export const AUDIO_SAMPLE_RATE = 16_000;

export const SUPPORTED_EXTENSIONS = [".mp3", ".mp4", ".m4a", ".wav", ".mov", ".ogg", ".webm", ".flac", ".aac"] as const;
export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.join(",");
export const SUPPORTED_FORMAT_LABELS = SUPPORTED_EXTENSIONS.map((extension) => extension.slice(1).toUpperCase());

export const VIDEO_EXTENSIONS = new Set<string>([".mp4", ".mov", ".webm"]);
export const AUDIO_EXTENSIONS = new Set<string>([".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac"]);

export const FFMPEG_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

export type Runtime = "webgpu" | "wasm";

export const MODEL_ID = "onnx-community/whisper-base_timestamped";

export const RUNTIME_LABELS: Record<Runtime, string> = {
  webgpu: "Fast local mode",
  wasm: "Standard local mode",
};

export const MODEL_LABELS: Record<Runtime, string> = {
  webgpu: "Whisper base timestamped",
  wasm: "Whisper base timestamped (smaller local build)",
};

export const LOCAL_PROCESSING_NOTE =
  "Saved on this device. The first use downloads the local tools this browser needs.";

export const ADD_RECORDING_LABEL = "Add recording";
export const ADD_RECORDING_HELPER = "Add a recording to begin.";
export const IMPORT_FILE_LABEL = "Import file";
export const SETTINGS_SIDEBAR_LABEL = "Setup";
export const SETTINGS_OPEN_LABEL = "Open setup and settings";
export const SETTINGS_SECTION_LABEL = "Settings";
export const SETTINGS_MODAL_TITLE = "Local workspace";
export const EMPTY_STATE_COPY =
  "Bring in audio or video. Transcribble transcribes it on this device and keeps everything here — searchable, editable, and exportable.";
export const SETTINGS_PRIVACY_COPY =
  "Recordings and transcripts stay in browser storage on this device. Transcribble does not upload your recordings.";
export const UNSUPPORTED_FILE_TYPE_MESSAGE = `Unsupported file type. Use ${formatList(
  SUPPORTED_FORMAT_LABELS,
)}.`;

function formatList(values: readonly string[]) {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} or ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}
