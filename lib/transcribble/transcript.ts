import type { TranscriptChunk, TranscriptPayload, TranscriptReference, TranscriptSegment } from "@/lib/transcribble/types";

const NORMALIZE_PUNCTUATION_PATTERN = /[^\p{L}\p{N}\s'-]+/gu;
const TOKEN_PATTERN = /[a-z0-9][a-z0-9'-]*/g;
const REPEATED_WORD_PATTERN = /\b([a-z]+)\s+\1\b/i;
const FILLER_PATTERN = /\b(um|uh|erm|mm-hmm|hmm)\b/gi;

export function normalizeSpacing(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeSearchText(value: string) {
  return normalizeSpacing(value).toLowerCase().replace(NORMALIZE_PUNCTUATION_PATTERN, " ");
}

export function tokenizeText(value: string): string[] {
  return normalizeSearchText(value).match(TOKEN_PATTERN) ?? [];
}

export function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function countWords(text: string) {
  const matches = normalizeSpacing(text).match(/\S+/g);
  return matches ? matches.length : 0;
}

export function countCharacters(text: string) {
  return text.length;
}

export function getSegmentReviewReasons(text: string) {
  const reasons: string[] = [];
  const normalized = normalizeSpacing(text);
  const words = countWords(normalized);

  if (words > 16 && !/[.!?]["']?$/.test(normalized)) {
    reasons.push("Long segment without sentence punctuation");
  }

  if (REPEATED_WORD_PATTERN.test(normalized.toLowerCase())) {
    reasons.push("Repeated words may need cleanup");
  }

  const fillerCount = (normalized.match(FILLER_PATTERN) ?? []).length;
  if (fillerCount >= 2) {
    reasons.push("Heavy filler language");
  }

  if (/[0-9]{4,}/.test(normalized)) {
    reasons.push("Contains a long numeric phrase worth double-checking");
  }

  return reasons;
}

function createSegment(
  projectId: string,
  index: number,
  turnIndex: number,
  parts: TranscriptChunk[],
  fallbackText?: string,
): TranscriptSegment | null {
  const text = normalizeSpacing(
    parts.length > 0 ? parts.map((part) => part.text).join(" ") : fallbackText ?? "",
  );

  if (!text) {
    return null;
  }

  const first = parts[0];
  const last = parts.at(-1);
  const start = first?.timestamp[0] ?? 0;
  const inferredEnd =
    typeof last?.timestamp[1] === "number"
      ? last.timestamp[1]
      : Math.max(start + Math.min(Math.max(countWords(text) / 2.8, 2), 8), start);
  const speakerLabels = new Set(parts.map((part) => part.speakerLabel).filter(Boolean));
  const attributions = new Set(parts.map((part) => part.attribution).filter(Boolean));

  return {
    id: `${projectId}-segment-${index + 1}`,
    index,
    text,
    start,
    end: inferredEnd,
    turnIndex,
    wordCount: countWords(text),
    characterCount: countCharacters(text),
    searchText: normalizeSearchText(text),
    tokens: tokenizeText(text),
    reviewReasons: getSegmentReviewReasons(text),
    speakerLabel: speakerLabels.size === 1 ? [...speakerLabels][0] : undefined,
    attribution: attributions.size === 1 ? [...attributions][0] : undefined,
  };
}

function buildFallbackSegments(projectId: string, text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => normalizeSpacing(paragraph))
    .filter(Boolean);

  return paragraphs
    .map((paragraph, index) =>
      createSegment(projectId, index, index, [], paragraph),
    )
    .filter((segment): segment is TranscriptSegment => Boolean(segment));
}

export function buildTranscriptSegments(projectId: string, payload: TranscriptPayload) {
  const chunks = payload.chunks?.filter((chunk) => normalizeSpacing(chunk.text).length > 0) ?? [];

  if (chunks.length === 0) {
    return buildFallbackSegments(projectId, payload.text.trim());
  }

  const segments: TranscriptSegment[] = [];
  let currentParts: TranscriptChunk[] = [];
  let currentText = "";
  let previousEnd = chunks[0]?.timestamp[0] ?? 0;
  let turnIndex = 0;

  for (const chunk of chunks) {
    const text = normalizeSpacing(chunk.text);

    if (!text) {
      continue;
    }

    const [start, end] = chunk.timestamp;
    const gap = Math.max(0, start - previousEnd);
    const shouldStartNewTurn = currentParts.length > 0 && gap > 2.25;
    const shouldBreakSegment =
      currentParts.length > 0 &&
      (shouldStartNewTurn || gap > 1.4 || currentText.length > 240 || /[.!?]["']?$/.test(currentText));

    if (shouldBreakSegment) {
      const segment = createSegment(projectId, segments.length, turnIndex, currentParts);
      if (segment) {
        segments.push(segment);
      }

      currentParts = [];
      currentText = "";

      if (shouldStartNewTurn) {
        turnIndex += 1;
      }
    }

    currentParts.push({
      text,
      timestamp: [start, end],
    });
    currentText = `${currentText}${currentText ? " " : ""}${text}`;
    previousEnd = typeof end === "number" ? end : start;
  }

  const finalSegment = createSegment(projectId, segments.length, turnIndex, currentParts);
  if (finalSegment) {
    segments.push(finalSegment);
  }

  return segments;
}

export function buildPlainTextFromSegments(segments: TranscriptSegment[]) {
  return segments.map((segment) => segment.text).join("\n\n").trim();
}

export function buildReadableTranscript(payload: TranscriptPayload, projectId = "preview") {
  const segments = buildTranscriptSegments(projectId, payload);
  return segments.length > 0 ? buildPlainTextFromSegments(segments) : payload.text.trim();
}

export function createSegmentReference(projectId: string, segment: TranscriptSegment): TranscriptReference {
  return {
    projectId,
    segmentId: segment.id,
    start: segment.start,
    end: segment.end,
    excerpt: segment.text,
  };
}

export function clampTime(time: number, duration?: number) {
  if (!Number.isFinite(time) || time < 0) {
    return 0;
  }

  if (!duration || !Number.isFinite(duration)) {
    return time;
  }

  return Math.min(Math.max(time, 0), duration);
}

export function buildSegmentTextState(text: string) {
  const normalized = normalizeSpacing(text);

  return {
    text: normalized,
    wordCount: countWords(normalized),
    characterCount: countCharacters(normalized),
    searchText: normalizeSearchText(normalized),
    tokens: tokenizeText(normalized),
    reviewReasons: getSegmentReviewReasons(normalized),
  };
}
