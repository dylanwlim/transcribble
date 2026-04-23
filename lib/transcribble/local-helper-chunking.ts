import {
  LOCAL_HELPER_CHUNK_OVERLAP_MS,
  LOCAL_HELPER_MIN_CHUNK_SEC,
  LOCAL_HELPER_TARGET_CHUNK_SEC,
} from "@/lib/transcribble/local-helper-config";

export interface LocalHelperChunkPlan {
  chunkIndex: number;
  startMs: number;
  endMs: number;
  primaryStartMs: number;
  primaryEndMs: number;
  overlapMs: number;
  durationSec: number;
}

export interface PlanLocalHelperChunksOptions {
  durationSec: number;
  overlapMs?: number;
  targetChunkSec?: number;
  minChunkSec?: number;
  fromPrimaryStartMs?: number;
  initialChunkIndex?: number;
}

export function planLocalHelperChunks(options: PlanLocalHelperChunksOptions): LocalHelperChunkPlan[] {
  const totalMs = Math.max(0, Math.round(options.durationSec * 1_000));
  const overlapMs = options.overlapMs ?? LOCAL_HELPER_CHUNK_OVERLAP_MS;
  const primaryChunkDurationMs = Math.max(
    (options.minChunkSec ?? LOCAL_HELPER_MIN_CHUNK_SEC) * 1_000,
    (options.targetChunkSec ?? LOCAL_HELPER_TARGET_CHUNK_SEC) * 1_000,
  );
  const fromPrimaryStartMs = options.fromPrimaryStartMs ?? 0;
  const initialChunkIndex = options.initialChunkIndex ?? 0;

  if (totalMs === 0 || fromPrimaryStartMs >= totalMs) {
    return [];
  }

  const chunks: LocalHelperChunkPlan[] = [];
  let primaryStartMs = fromPrimaryStartMs;
  let chunkIndex = initialChunkIndex;

  while (primaryStartMs < totalMs) {
    const primaryEndMs = Math.min(totalMs, primaryStartMs + primaryChunkDurationMs);
    const startMs = chunkIndex === initialChunkIndex ? primaryStartMs : Math.max(0, primaryStartMs - overlapMs);
    const endMs = primaryEndMs;

    chunks.push({
      chunkIndex,
      startMs,
      endMs,
      primaryStartMs,
      primaryEndMs,
      overlapMs,
      durationSec: Math.max(0, (endMs - startMs) / 1_000),
    });

    primaryStartMs = primaryEndMs;
    chunkIndex += 1;
  }

  return chunks;
}
