export interface TranscriptChunk {
  text: string;
  timestamp: [number, number | null];
}

export interface TranscriptPayload {
  text: string;
  chunks?: TranscriptChunk[];
}

function normalizeSpacing(value: string) {
  return value.replace(/\s+/g, " ").trim();
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

export function buildReadableTranscript(payload: TranscriptPayload) {
  const chunks = payload.chunks?.filter((chunk) => normalizeSpacing(chunk.text).length > 0) ?? [];

  if (chunks.length === 0) {
    return payload.text.trim();
  }

  const paragraphs: string[] = [];
  let current = "";
  let previousEnd = 0;

  for (const chunk of chunks) {
    const text = normalizeSpacing(chunk.text);
    if (!text) {
      continue;
    }

    const [start, end] = chunk.timestamp;
    const gap = Math.max(0, start - previousEnd);
    const shouldBreak =
      current.length > 0 &&
      (gap > 1.75 || current.length > 260 || /[.!?]["']?$/.test(current));

    if (shouldBreak) {
      paragraphs.push(current.trim());
      current = "";
    }

    current = `${current}${current ? " " : ""}${text}`;

    if (typeof end === "number") {
      previousEnd = end;
    }
  }

  if (current.trim()) {
    paragraphs.push(current.trim());
  }

  return paragraphs.join("\n\n");
}

export function countWords(text: string) {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function countCharacters(text: string) {
  return text.length;
}
