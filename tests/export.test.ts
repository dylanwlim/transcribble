import assert from "node:assert/strict";
import test from "node:test";

import { buildTranscriptDocument } from "@/lib/transcribble/analysis";
import { getExportFilename, serializeProject } from "@/lib/transcribble/export";
import type { TranscriptProject, TranscriptPayload } from "@/lib/transcribble/types";

const payload: TranscriptPayload = {
  text: "",
  chunks: [
    { text: "Kickoff starts now.", timestamp: [0, 2.5] },
    { text: "We should send the recap by 2026-04-03.", timestamp: [3.1, 7.6] },
    { text: "Can we keep the transcript exports in markdown and vtt?", timestamp: [8.2, 12.9] },
  ],
};

function buildProject(): TranscriptProject {
  return {
    id: "export-project",
    title: "Launch Review",
    sourceName: "launch-review.wav",
    sourceType: "audio/wav",
    sourceSize: 2048,
    mediaKind: "audio",
    createdAt: new Date("2026-03-31T09:00:00Z").toISOString(),
    updatedAt: new Date("2026-03-31T09:30:00Z").toISOString(),
    status: "ready",
    progress: 100,
    stageLabel: "Ready",
    detail: "Saved locally.",
    runtime: "wasm",
    duration: 12.9,
    fileStoreKey: "export-project",
    marks: [],
    transcript: buildTranscriptDocument("export-project", payload, 12.9),
  };
}

test("markdown export includes summary and transcript timestamps", () => {
  const project = buildProject();
  const markdown = serializeProject(project, "md");

  assert.match(markdown, /# Launch Review/);
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /\[0:00\]/);
  assert.equal(getExportFilename(project, "md"), "launch-review.md");
});

test("subtitle exports emit cue timing", () => {
  const project = buildProject();
  const srt = serializeProject(project, "srt");
  const vtt = serializeProject(project, "vtt");

  assert.match(srt, /00:00:00,000 --> 00:00:02,500/);
  assert.match(vtt, /WEBVTT/);
  assert.match(vtt, /00:00:03\.100 --> 00:00:07\.600/);
});
