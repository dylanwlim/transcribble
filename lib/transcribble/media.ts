import type { FFmpeg } from "@ffmpeg/ffmpeg";

import {
  ACCEPT_ATTRIBUTE,
  AUDIO_SAMPLE_RATE,
  FFMPEG_CORE_BASE_URL,
  SUPPORTED_FORMAT_LABELS,
  SUPPORTED_EXTENSIONS,
  UNSUPPORTED_FILE_TYPE_MESSAGE,
  VIDEO_EXTENSIONS,
} from "@/lib/transcribble/constants";
import type { BrowserStorageState } from "@/lib/transcribble/storage";
import { validateLocalStorageCapacity } from "@/lib/transcribble/storage";
import { formatBytes } from "@/lib/transcribble/transcript";

export interface ValidationResult {
  ok: boolean;
  extension?: string;
  mediaKind?: "audio" | "video";
  error?: string;
  availableStorageBytes?: number | null;
  requiredStorageBytes?: number | null;
}

export interface PreparedAudio {
  audio: Float32Array;
  duration: number;
  mediaKind: "audio" | "video";
  usedFFmpeg: boolean;
}

export interface PreparationCallbacks {
  onStatus?: (detail: string) => void;
  onProgress?: (progress: number | null) => void;
}

export class LocalPreparationRiskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalPreparationRiskError";
  }
}

export function computeRmsEnvelope(audio: Float32Array, bins = 1024): number[] {
  if (audio.length === 0 || bins <= 0) return [];
  const out = new Array<number>(bins);
  const samplesPerBin = audio.length / bins;
  let peak = 0;
  for (let i = 0; i < bins; i += 1) {
    const start = Math.floor(i * samplesPerBin);
    const end = Math.min(audio.length, Math.floor((i + 1) * samplesPerBin));
    let sumSquares = 0;
    const count = Math.max(1, end - start);
    for (let j = start; j < end; j += 1) {
      const s = audio[j];
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / count);
    out[i] = rms;
    if (rms > peak) peak = rms;
  }
  if (peak > 0) {
    for (let i = 0; i < bins; i += 1) out[i] = out[i] / peak;
  }
  return out;
}

type AudioContextConstructor = typeof AudioContext;
type WindowWithWebKitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

let ffmpegPromise: Promise<FFmpeg> | null = null;
let ffmpegProgressCallback: ((progress: number) => void) | null = null;

export async function detectPreferredRuntime() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "wasm" as const;
  }

  const gpu = (navigator as Navigator & {
    gpu?: {
      requestAdapter?: () => Promise<unknown>;
    };
  }).gpu;

  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return "wasm" as const;
  }

  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? ("webgpu" as const) : ("wasm" as const);
  } catch {
    return "wasm" as const;
  }
}

export function getLocalInferenceCapabilityIssue() {
  if (typeof window === "undefined") {
    return null;
  }

  if (typeof Worker === "undefined") {
    return "This browser does not support background workers, so local transcription cannot start.";
  }

  if (typeof WebAssembly === "undefined") {
    return "This browser is missing WebAssembly support required for local inference.";
  }

  const AudioContextClass =
    window.AudioContext ?? (window as WindowWithWebKitAudioContext).webkitAudioContext;

  if (!AudioContextClass) {
    return "This browser cannot decode media locally because the Web Audio API is unavailable.";
  }

  return null;
}

export function getFileExtension(name: string) {
  const match = /\.[^.]+$/.exec(name.toLowerCase());
  return match?.[0] ?? "";
}

export function validateMediaFile(file: File | null): ValidationResult {
  if (!file) {
    return {
      ok: false,
      error: "Choose a file to transcribe.",
    };
  }

  const extension = getFileExtension(file.name);

  if (!SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return {
      ok: false,
      error: UNSUPPORTED_FILE_TYPE_MESSAGE,
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: "That file is empty. Choose a media file with playable audio.",
    };
  }

  return {
    ok: true,
    extension,
    mediaKind: VIDEO_EXTENSIONS.has(extension) ? "video" : "audio",
  };
}

export async function validateMediaImport(
  file: File | null,
  storageState?: BrowserStorageState | null,
): Promise<ValidationResult> {
  const baseValidation = validateMediaFile(file);

  if (!baseValidation.ok || !file) {
    return baseValidation;
  }

  const capacity = await validateLocalStorageCapacity(file.size, storageState);

  if (!capacity.ok) {
    return {
      ...baseValidation,
      ok: false,
      availableStorageBytes: capacity.availableBytes,
      requiredStorageBytes: capacity.requiredBytes,
      error: `Not enough local storage for this recording. This file needs about ${formatBytes(
        capacity.requiredBytes ?? file.size,
      )}; available local storage is about ${formatBytes(
        capacity.availableBytes ?? 0,
      )}. Free space or choose a smaller file.`,
    };
  }

  return {
    ...baseValidation,
    availableStorageBytes: capacity.availableBytes,
    requiredStorageBytes: capacity.requiredBytes,
  };
}

function getAudioContextClass() {
  const AudioContextClass =
    window.AudioContext ?? (window as WindowWithWebKitAudioContext).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio is unavailable in this browser.");
  }

  return AudioContextClass;
}

async function decodeAudioData(arrayBuffer: ArrayBuffer) {
  const AudioContextClass = getAudioContextClass();
  const context = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE });

  try {
    const decoded = await context.decodeAudioData(arrayBuffer);
    const audio = toMono(decoded);

    if (audio.length === 0 || decoded.duration <= 0) {
      throw new Error("The file did not contain readable audio.");
    }

    return {
      audio,
      duration: decoded.duration,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function toMono(buffer: AudioBuffer) {
  if (buffer.numberOfChannels === 1) {
    return new Float32Array(buffer.getChannelData(0));
  }

  const mono = new Float32Array(buffer.length);
  const scale = Math.sqrt(2);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let index = 0; index < buffer.length; index += 1) {
    mono[index] = (scale * (left[index] + right[index])) / 2;
  }

  return mono;
}

async function getFFmpeg(onProgress?: (progress: number) => void) {
  ffmpegProgressCallback = onProgress ?? null;

  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);

      const ffmpeg = new FFmpeg();

      ffmpeg.on("progress", ({ progress }) => {
        ffmpegProgressCallback?.(progress * 100);
      });

      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      return ffmpeg;
    })();
  }

  return ffmpegPromise;
}

async function cleanupFFmpegFiles(ffmpeg: FFmpeg, ...files: string[]) {
  const api = ffmpeg as FFmpeg & {
    deleteFile?: (path: string) => Promise<void>;
    unlink?: (path: string) => Promise<void>;
  };

  await Promise.all(
    files.map(async (file) => {
      try {
        if (typeof api.deleteFile === "function") {
          await api.deleteFile(file);
        } else if (typeof api.unlink === "function") {
          await api.unlink(file);
        }
      } catch {
        return undefined;
      }

      return undefined;
    }),
  );
}

async function extractWithFFmpeg(file: File, callbacks: PreparationCallbacks): Promise<PreparedAudio> {
  callbacks.onStatus?.("Getting video support ready in this browser...");
  const ffmpeg = await getFFmpeg(callbacks.onProgress);

  callbacks.onStatus?.("Pulling the audio out of the recording in this browser...");
  callbacks.onProgress?.(4);

  const { fetchFile } = await import("@ffmpeg/util");
  const extension = getFileExtension(file.name) || ".media";
  const safeBaseName = file.name.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "recording";
  const inputName = `${safeBaseName}${extension}`;
  const outputName = `${safeBaseName}-audio.wav`;

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(AUDIO_SAMPLE_RATE),
      "-f",
      "wav",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const unknownData = data as unknown;
    let buffer: ArrayBuffer;

    if (data instanceof Uint8Array) {
      buffer = data.slice().buffer;
    } else if (unknownData instanceof ArrayBuffer) {
      buffer = unknownData;
    } else if (
      typeof SharedArrayBuffer !== "undefined" &&
      unknownData instanceof SharedArrayBuffer
    ) {
      buffer = new Uint8Array(unknownData).slice().buffer;
    } else {
      throw new Error("Local media extraction did not return audio bytes.");
    }

    const decoded = await decodeAudioData(buffer);

    return {
      ...decoded,
      mediaKind: VIDEO_EXTENSIONS.has(extension) ? "video" : "audio",
      usedFFmpeg: true,
    };
  } finally {
    callbacks.onProgress?.(100);
    await cleanupFFmpegFiles(ffmpeg, inputName, outputName);
  }
}

export async function prepareAudioForTranscription(
  file: File,
  callbacks: PreparationCallbacks = {},
): Promise<PreparedAudio> {
  const validation = validateMediaFile(file);

  if (!validation.ok || !validation.mediaKind) {
    throw new Error(validation.error ?? "Choose a supported media file.");
  }

  const localPreparationRisk = getLocalPreparationRisk(file.size, validation.mediaKind);
  if (localPreparationRisk) {
    throw new LocalPreparationRiskError(localPreparationRisk);
  }

  if (validation.mediaKind === "video") {
    return extractWithFFmpeg(file, callbacks);
  }

  callbacks.onStatus?.("Reading the audio on this device...");
  callbacks.onProgress?.(12);

  try {
    const arrayBuffer = await file.arrayBuffer();
    callbacks.onProgress?.(45);

    const decoded = await decodeAudioData(arrayBuffer);
    callbacks.onProgress?.(100);

    return {
      ...decoded,
      mediaKind: "audio",
      usedFFmpeg: false,
    };
  } catch {
    callbacks.onStatus?.("This browser needed its fallback media tools for this recording...");
    return extractWithFFmpeg(file, callbacks);
  }
}

export async function warmMediaRuntime(callbacks: PreparationCallbacks = {}) {
  callbacks.onStatus?.("Getting the browser ready for video and media fallback...");
  callbacks.onProgress?.(0);
  await getFFmpeg(callbacks.onProgress);
  callbacks.onStatus?.("Video support is ready in this browser.");
  callbacks.onProgress?.(100);
}

export function describeFile(file: File | null) {
  if (!file) {
    return "No media selected";
  }

  return `${getFileExtension(file.name).slice(1).toUpperCase()} · ${formatBytes(file.size)}`;
}

export function getInputAcceptValue() {
  return ACCEPT_ATTRIBUTE;
}

export function humanizePreparationError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("decode")) {
      return "This browser could not read that recording locally.";
    }

    if (message.includes("memory") || message.includes("out of memory")) {
      return "Could not process this file locally. Try again or use a shorter recording.";
    }

    return error.message;
  }

  return "Could not process this file locally. Try again or use a shorter recording.";
}

function getLocalPreparationRisk(fileSize: number, mediaKind: "audio" | "video") {
  if (typeof navigator === "undefined") {
    return null;
  }

  const deviceMemory =
    (navigator as Navigator & {
      deviceMemory?: number;
    }).deviceMemory;

  if (!Number.isFinite(deviceMemory) || !deviceMemory) {
    return null;
  }

  const memoryBudgetBytes =
    deviceMemory *
    1024 *
    1024 *
    1024 *
    (mediaKind === "video" ? 0.08 : 0.12);

  if (fileSize <= memoryBudgetBytes) {
    return null;
  }

  return `This recording is saved on this device, but this browser may not have enough memory to process ${formatBytes(
    fileSize,
  )} locally in one pass. Try again on a desktop browser or use a shorter recording.`;
}

export function getSupportedFormatLabels() {
  return [...SUPPORTED_FORMAT_LABELS];
}
