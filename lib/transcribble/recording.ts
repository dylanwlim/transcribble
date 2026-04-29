export type RecordingStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "stopping"
  | "saving"
  | "transcribing"
  | "saved"
  | "error";

export interface RecordingViewState {
  status: RecordingStatus;
  startedAt: string | null;
  stoppedAt: string | null;
  elapsedMs: number;
  mimeType: string | null;
  chunkCount: number;
  liveEnvelope: number[];
  liveFinalTranscript: string;
  liveInterimTranscript: string;
  error: string | null;
  notice: string | null;
  liveSpeechRecognitionSupported: boolean;
  liveSpeechRecognitionActive: boolean;
  savedProjectId: string | null;
  canRetrySave: boolean;
  previewUrl: string | null;
}

export interface LiveTranscriptPart {
  transcript: string;
  isFinal: boolean;
}

export interface RecordingMimeTypeSupport {
  isTypeSupported?: (mimeType: string) => boolean;
}

export const RECORDING_MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

export const LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE =
  "Live transcript is unavailable in this browser. Your recording will still save and transcribe after you stop.";

export const INITIAL_RECORDING_VIEW_STATE: RecordingViewState = {
  status: "idle",
  startedAt: null,
  stoppedAt: null,
  elapsedMs: 0,
  mimeType: null,
  chunkCount: 0,
  liveEnvelope: [],
  liveFinalTranscript: "",
  liveInterimTranscript: "",
  error: null,
  notice: null,
  liveSpeechRecognitionSupported: false,
  liveSpeechRecognitionActive: false,
  savedProjectId: null,
  canRetrySave: false,
  previewUrl: null,
};

export function getRecordingSaveErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return "Not enough local browser storage was available to save this recording. Free space and try saving again.";
    }

    if (error.name === "AbortError") {
      return "Saving was canceled before this recording was written. Try saving again when you're ready.";
    }
  }

  const rawMessage = error instanceof Error ? error.message.trim() : "";
  const lower = rawMessage.toLowerCase();

  if (
    lower === "failed to fetch" ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  ) {
    return "The local accelerator was not reachable on localhost. The recording is still here; run npm run helper:start or npm run helper:check, then try again.";
  }

  if (lower.includes("quota") || lower.includes("storage")) {
    return rawMessage || "Local browser storage could not save this recording. Free space and try again.";
  }

  return rawMessage || "This recording could not be saved. Try again when you're ready.";
}

export function buildRecordingSaveFailureState(
  previous: RecordingViewState,
  error: unknown,
  canRetrySave: boolean,
): RecordingViewState {
  return {
    ...previous,
    status: "error",
    error: getRecordingSaveErrorMessage(error),
    canRetrySave,
    liveSpeechRecognitionActive: false,
  };
}

export function chooseRecordingMimeType(support?: RecordingMimeTypeSupport | null) {
  if (!support || typeof support.isTypeSupported !== "function") {
    return undefined;
  }

  return RECORDING_MIME_TYPE_CANDIDATES.find((mimeType) => support.isTypeSupported?.(mimeType));
}

export function getRecordingFileExtension(mimeType?: string | null) {
  const normalized = mimeType?.toLowerCase() ?? "";

  if (normalized.includes("mp4") || normalized.includes("aac")) {
    return "m4a";
  }

  if (normalized.includes("ogg")) {
    return "ogg";
  }

  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }

  if (normalized.includes("wav")) {
    return "wav";
  }

  return "webm";
}

export function buildRecordingFileName(startedAt: Date, mimeType?: string | null) {
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `Recording ${stamp}.${getRecordingFileExtension(mimeType)}`;
}

export function formatRecordingTitle(startedAt: Date) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(startedAt);

  return `Recording ${formatted}`;
}

export function formatRecordingTimer(elapsedMs: number) {
  const safeMs = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const totalCentiseconds = Math.floor(safeMs / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    centiseconds,
  ).padStart(2, "0")}`;
}

export function mergeLiveTranscriptParts(
  currentFinalText: string,
  parts: readonly LiveTranscriptPart[],
) {
  let finalText = normalizeTranscriptText(currentFinalText);
  const interimParts: string[] = [];

  for (const part of parts) {
    const text = normalizeTranscriptText(part.transcript);
    if (!text) {
      continue;
    }

    if (part.isFinal) {
      finalText = appendTranscriptText(finalText, text);
    } else {
      interimParts.push(text);
    }
  }

  return {
    finalText,
    interimText: normalizeTranscriptText(interimParts.join(" ")),
  };
}

export function buildLiveTranscriptText(finalText: string, interimText: string) {
  return appendTranscriptText(finalText, interimText);
}

export function resampleRecordingEnvelope(samples: readonly number[], maxSamples: number) {
  if (maxSamples <= 0 || samples.length === 0) {
    return [] as number[];
  }

  if (samples.length <= maxSamples) {
    return samples.map(clampEnvelopeValue);
  }

  const result = new Array<number>(maxSamples);
  const ratio = samples.length / maxSamples;

  for (let index = 0; index < maxSamples; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end && sampleIndex < samples.length; sampleIndex += 1) {
      peak = Math.max(peak, clampEnvelopeValue(samples[sampleIndex] ?? 0));
    }

    result[index] = peak;
  }

  return result;
}

function appendTranscriptText(left: string, right: string) {
  const normalizedLeft = normalizeTranscriptText(left);
  const normalizedRight = normalizeTranscriptText(right);

  if (!normalizedLeft) {
    return normalizedRight;
  }

  if (!normalizedRight) {
    return normalizedLeft;
  }

  return `${normalizedLeft} ${normalizedRight}`.trim();
}

function normalizeTranscriptText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clampEnvelopeValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
