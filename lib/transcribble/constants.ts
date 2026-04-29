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
export const LOCAL_ACCELERATOR_NOTE =
  "Saved on this device. Longer or larger recordings should use the local accelerator running on this machine.";
export const LOCAL_ACCELERATOR_REQUIRED_NOTE =
  "Large or memory-heavy recordings need the Transcribble Helper running on this machine. Run npm run helper:start, or run npm run helper:check to diagnose setup, then retry.";
export const LOCAL_ACCELERATOR_ENDPOINT = "http://127.0.0.1:7771";
export const LOCAL_ACCELERATOR_FALLBACK_ENDPOINT = "http://localhost:7771";
export const LOCAL_ACCELERATOR_INSTALL_COMMAND = "npm run helper:install";
export const LOCAL_ACCELERATOR_START_COMMAND = "npm run helper:start";
export const LOCAL_ACCELERATOR_CHECK_COMMAND = "npm run helper:check";

export const ADD_RECORDING_LABEL = "Add recording";
export const ADD_RECORDING_HELPER = "Add a recording to begin.";
export const IMPORT_FILE_LABEL = "Import file";
export const DESKTOP_APP_LABEL = "Open desktop app";
export const SETTINGS_SIDEBAR_LABEL = "Setup";
export const SETTINGS_OPEN_LABEL = "Open workspace settings";
export const SETTINGS_SECTION_LABEL = "Workspace";
export const SETTINGS_MODAL_TITLE = "Workspace settings";
export const EMPTY_STATE_COPY =
  "Drop in MP3, MP4, M4A, WAV, and other recordings. Transcribble keeps the file local, routes long media to the helper, splits it into local chunks, stitches the transcript, and gives you a clean text export.";
export const SETTINGS_PRIVACY_COPY =
  "Browser mode keeps shorter jobs on this device. The local accelerator runs on this machine for long or memory-heavy recordings, chunks the speech locally, and merges the transcript before export.";
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
