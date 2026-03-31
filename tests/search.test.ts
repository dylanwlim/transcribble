import assert from "node:assert/strict";
import test from "node:test";

import { buildTranscriptDocument } from "@/lib/transcribble/analysis";
import { searchProjectLibrary } from "@/lib/transcribble/search";
import type { TranscriptProject, TranscriptPayload } from "@/lib/transcribble/types";

const payload: TranscriptPayload = {
  text: "",
  chunks: [
    { text: "The release review is ready for export.", timestamp: [0, 3.2] },
    { text: "We should keep the evidence links intact.", timestamp: [3.7, 7.8] },
  ],
};

function buildProject(overrides: Partial<TranscriptProject>): TranscriptProject {
  return {
    id: overrides.id ?? "project-1",
    title: overrides.title ?? "Launch Review",
    sourceName: overrides.sourceName ?? "launch-review.wav",
    sourceType: overrides.sourceType ?? "audio/wav",
    sourceSize: overrides.sourceSize ?? 1024,
    mediaKind: overrides.mediaKind ?? "audio",
    createdAt: overrides.createdAt ?? new Date("2026-03-31T09:00:00Z").toISOString(),
    updatedAt: overrides.updatedAt ?? new Date("2026-03-31T09:30:00Z").toISOString(),
    status: overrides.status ?? "ready",
    progress: overrides.progress ?? 100,
    stageLabel: overrides.stageLabel ?? "Ready",
    detail: overrides.detail ?? "Saved locally.",
    runtime: overrides.runtime ?? "wasm",
    duration: overrides.duration ?? 7.8,
    fileStoreKey: overrides.fileStoreKey ?? overrides.id ?? "project-1",
    marks: overrides.marks ?? [],
    transcript: overrides.transcript,
  };
}

test("library search returns title-only matches for projects without transcripts", () => {
  const projects: TranscriptProject[] = [
    buildProject({
      id: "queued-project",
      title: "Interview Notes",
      status: "queued",
      progress: 0,
      stageLabel: "Queued",
      detail: "Waiting to transcribe.",
      transcript: undefined,
    }),
    buildProject({
      id: "ready-project",
      title: "Launch Review",
      transcript: buildTranscriptDocument("ready-project", payload, 7.8),
    }),
  ];

  const results = searchProjectLibrary(projects, "interview");

  assert.equal(results[0]?.projectId, "queued-project");
  assert.equal(results[0]?.matchKind, "title");
});

test("library search still returns transcript span matches", () => {
  const projects: TranscriptProject[] = [
    buildProject({
      id: "ready-project",
      title: "Launch Review",
      transcript: buildTranscriptDocument("ready-project", payload, 7.8),
    }),
  ];

  const results = searchProjectLibrary(projects, "evidence links");

  assert.equal(results[0]?.projectId, "ready-project");
  assert.equal(results[0]?.matchKind, "segment");
  assert.match(results[0]?.entry.text ?? "", /evidence links/i);
});
