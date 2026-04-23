import type { TranscriptChunk, TranscriptPayload } from "@/lib/transcribble/types";
import { normalizeSpacing } from "@/lib/transcribble/transcript";

export interface LocalHelperChunkTranscriptInput {
  chunkIndex: number;
  startMs: number;
  endMs: number;
  primaryStartMs: number;
  primaryEndMs: number;
  payload: TranscriptPayload;
}

function buildFallbackChunk(
  chunk: LocalHelperChunkTranscriptInput,
  text: string,
): TranscriptChunk[] {
  const normalized = normalizeSpacing(text);
  if (!normalized) {
    return [];
  }

  return [
    {
      text: normalized,
      timestamp: [0, Math.max(0, (chunk.endMs - chunk.startMs) / 1_000)],
    },
  ];
}

function normalizeChunkPayload(chunk: LocalHelperChunkTranscriptInput) {
  return (chunk.payload.chunks?.length ? chunk.payload.chunks : buildFallbackChunk(chunk, chunk.payload.text)).map(
    (entry) => {
      const startMs = chunk.startMs + Math.round(entry.timestamp[0] * 1_000);
      const endMs =
        entry.timestamp[1] === null
          ? null
          : chunk.startMs + Math.round(entry.timestamp[1] * 1_000);
      const midpointMs = endMs === null ? startMs : startMs + Math.round((endMs - startMs) / 2);

      return {
        ...entry,
        startMs,
        endMs,
        midpointMs,
      };
    },
  );
}

function shouldKeepChunkEntry(
  chunk: LocalHelperChunkTranscriptInput,
  entry: ReturnType<typeof normalizeChunkPayload>[number],
) {
  return entry.midpointMs >= chunk.primaryStartMs && entry.midpointMs <= chunk.primaryEndMs;
}

function isDuplicateText(left: TranscriptChunk | undefined, right: TranscriptChunk) {
  if (!left) {
    return false;
  }

  if ((left.speakerLabel ?? "") !== (right.speakerLabel ?? "")) {
    return false;
  }

  return normalizeSpacing(left.text).toLowerCase() === normalizeSpacing(right.text).toLowerCase();
}

export function mergeLocalHelperTranscriptChunks(chunks: LocalHelperChunkTranscriptInput[]): TranscriptPayload {
  const ordered = [...chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  const mergedChunks: TranscriptChunk[] = [];
  const textParts: string[] = [];

  for (const chunk of ordered) {
    const normalizedEntries = normalizeChunkPayload(chunk).filter((entry) => shouldKeepChunkEntry(chunk, entry));

    for (const entry of normalizedEntries) {
      const nextChunk: TranscriptChunk = {
        text: normalizeSpacing(entry.text),
        timestamp: [entry.startMs / 1_000, entry.endMs === null ? null : entry.endMs / 1_000],
        speakerLabel: entry.speakerLabel,
        attribution: entry.attribution,
      };

      if (!nextChunk.text || isDuplicateText(mergedChunks.at(-1), nextChunk)) {
        continue;
      }

      mergedChunks.push(nextChunk);
      textParts.push(nextChunk.text);
    }
  }

  return {
    text: normalizeSpacing(textParts.join(" ")),
    chunks: mergedChunks,
    language: ordered[0]?.payload.language,
  };
}
