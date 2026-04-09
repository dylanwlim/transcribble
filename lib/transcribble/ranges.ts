import { normalizeSearchText, normalizeSpacing, tokenizeText } from "@/lib/transcribble/transcript";
import type { ProjectSearchEntry, SavedRange, TranscriptSegment } from "@/lib/transcribble/types";

export function normalizeRangeBounds(start: number, end: number) {
  const safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
  const safeEnd = Number.isFinite(end) ? Math.max(0, end) : safeStart;

  return safeStart <= safeEnd
    ? { start: safeStart, end: safeEnd }
    : {
        start: safeEnd,
        end: safeStart,
      };
}

export function getSegmentsForRange(segments: TranscriptSegment[], start: number, end: number) {
  const bounds = normalizeRangeBounds(start, end);

  return segments.filter((segment) => segment.end >= bounds.start && segment.start <= bounds.end);
}

export function buildSavedRangeLabel(sourceText: string) {
  const normalized = normalizeSpacing(sourceText);
  if (!normalized) {
    return "Saved moment";
  }

  return normalized.length > 56 ? `${normalized.slice(0, 55).trimEnd()}…` : normalized;
}

export function getSavedRangeExcerpt(range: SavedRange, segments: TranscriptSegment[]) {
  const excerptSegments = segments.filter((segment) => range.segmentIds.includes(segment.id));
  const excerpt = normalizeSpacing(excerptSegments.map((segment) => segment.text).join(" "));

  if (!excerpt && range.note) {
    return normalizeSpacing(range.note);
  }

  return excerpt;
}

export function buildSavedRangeSearchEntries(ranges: SavedRange[], segments: TranscriptSegment[]): ProjectSearchEntry[] {
  return ranges.map((range) => {
    const excerpt = getSavedRangeExcerpt(range, segments);
    const searchText = normalizeSpacing([range.label, range.note, excerpt].filter(Boolean).join(" • "));

    return {
      segmentId: range.segmentIds[0] ?? "",
      start: range.start,
      end: range.end,
      text: searchText || range.label,
      normalizedText: normalizeSearchText(searchText || range.label),
      tokens: tokenizeText(searchText || range.label),
      kind: "saved-range",
      label: range.label,
    } satisfies ProjectSearchEntry;
  });
}
