import { getSavedRangeExcerpt } from "@/lib/transcribble/ranges";
import { formatBytes, formatDuration } from "@/lib/transcribble/transcript";
import type { TranscriptProject } from "@/lib/transcribble/types";

export type ExportFormat = "txt" | "md" | "srt" | "vtt";

function padTimestamp(value: number, separator: "," | ".") {
  const safe = Math.max(0, value);
  const roundedMilliseconds = Math.round(safe * 1000);
  const hours = Math.floor(roundedMilliseconds / 3_600_000);
  const minutes = Math.floor((roundedMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((roundedMilliseconds % 60_000) / 1000);
  const milliseconds = roundedMilliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(milliseconds).padStart(3, "0")}`;
}

function getSegmentTimestampLine(start: number, end: number, separator: "," | ".") {
  return `${padTimestamp(start, separator)} --> ${padTimestamp(end, separator)}`;
}

export function getExportFilename(project: TranscriptProject, format: ExportFormat) {
  const baseName = project.sourceName.replace(/\.[^.]+$/, "") || project.title || "transcribble-project";
  return `${baseName}.${format}`;
}

export function serializeProject(project: TranscriptProject, format: ExportFormat) {
  if (!project.transcript) {
    return "";
  }

  switch (format) {
    case "txt":
      return project.transcript.plainText;
    case "md":
      return buildMarkdownExport(project);
    case "srt":
      return buildSrtExport(project);
    case "vtt":
      return buildVttExport(project);
    default:
      return project.transcript.plainText;
  }
}

function buildMarkdownExport(project: TranscriptProject) {
  if (!project.transcript) {
    return "";
  }

  const marksBySegmentId = new Map(project.marks.map((mark) => [mark.segmentId, mark]));
  const chapters = project.transcript.chapters
    .map((chapter) => `- ${chapter.title} (${formatDuration(chapter.start)}-${formatDuration(chapter.end)})`)
    .join("\n");
  const summary = project.transcript.insights.summary.map((item) => `- ${item.text} (${formatDuration(item.reference.start)})`).join("\n");
  const actions = project.transcript.insights.actions
    .map((item) => `- ${item.text}${item.dueLabel ? ` [${item.dueLabel}]` : ""} (${formatDuration(item.reference.start)})`)
    .join("\n");
  const questions = project.transcript.insights.questions
    .map((item) => `- ${item.text} (${formatDuration(item.reference.start)})`)
    .join("\n");
  const dates = project.transcript.insights.dates
    .map((item) =>
      `- ${item.label}${item.normalizedDate ? ` -> ${item.normalizedDate}` : ""} (${formatDuration(item.reference.start)})`,
    )
    .join("\n");
  const keyMoments = project.transcript.insights.keyMoments
    .map((item) => `- ${item.title} [${item.reason}] (${formatDuration(item.reference.start)})`)
    .join("\n");
  const reviewCues = project.transcript.insights.reviewCues
    .map((item) => `- ${item.reason} [${item.severity}] (${formatDuration(item.reference.start)})`)
    .join("\n");
  const savedMoments = project.marks
    .map((mark) => {
      const segment = project.transcript?.segments.find((item) => item.id === mark.segmentId);
      return segment
        ? `- ${mark.label} [${mark.kind}${mark.color ? ` · ${mark.color}` : ""}] (${formatDuration(segment.start)})`
        : null;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n");
  const savedRanges = project.savedRanges
    .map((range) => {
      const excerpt = getSavedRangeExcerpt(range, project.transcript?.segments ?? []);
      const noteLine = range.note ? ` — ${range.note}` : "";
      const excerptLine = excerpt ? `\n  ${excerpt}` : "";
      return `- ${range.label} (${formatDuration(range.start)}-${formatDuration(range.end)})${noteLine}${excerptLine}`;
    })
    .join("\n");
  const transcriptBody = project.transcript.segments
    .map((segment) => {
      const mark = marksBySegmentId.get(segment.id);
      const prefix = mark ? `> ${mark.kind.toUpperCase()}: ${mark.label}\n` : "";
      return `${prefix}[${formatDuration(segment.start)}] ${segment.text}`;
    })
    .join("\n\n");

  return `# ${project.title}

## Session

- Source: ${project.sourceName}
- Size: ${formatBytes(project.sourceSize)}
- Duration: ${formatDuration(project.transcript.stats.duration)}
- Runtime: ${project.runtime ?? "unknown"}
- Generated: ${new Date(project.updatedAt).toLocaleString()}

## Summary

${summary || "- No summary bullets generated"}

## Action Items

${actions || "- No action items detected"}

## Questions

${questions || "- No open questions detected"}

## Dates

${dates || "- No dates detected"}

## Chapters

${chapters || "- No chapters available"}

## Saved Moments

${savedMoments || "- No saved moments yet"}

## Saved Ranges

${savedRanges || "- No saved ranges yet"}

## Key Moments

${keyMoments || "- No key moments detected"}

## Review Cues

${reviewCues || "- No review cues detected"}

## Transcript

${transcriptBody}
`;
}

function buildSrtExport(project: TranscriptProject) {
  if (!project.transcript) {
    return "";
  }

  return project.transcript.segments
    .map(
      (segment, index) =>
        `${index + 1}\n${getSegmentTimestampLine(segment.start, segment.end, ",")}\n${segment.text}`,
    )
    .join("\n\n");
}

function buildVttExport(project: TranscriptProject) {
  if (!project.transcript) {
    return "";
  }

  return `WEBVTT\n\n${project.transcript.segments
    .map(
      (segment) =>
        `${getSegmentTimestampLine(segment.start, segment.end, ".")}\n${segment.text}`,
    )
    .join("\n\n")}`;
}
