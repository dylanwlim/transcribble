import assert from "node:assert/strict";
import test from "node:test";

import { applyProjectStep, getDefaultProjectStep, getProjectStatusCopy } from "@/lib/transcribble/status";
import type { TranscriptProject } from "@/lib/transcribble/types";

function buildProject(): TranscriptProject {
  return {
    id: "status-project",
    title: "Status Project",
    sourceName: "status.wav",
    sourceType: "audio/wav",
    sourceSize: 1024,
    mediaKind: "audio",
    createdAt: new Date("2026-03-31T09:00:00Z").toISOString(),
    updatedAt: new Date("2026-03-31T09:00:00Z").toISOString(),
    status: "queued",
    step: "queued",
    progress: 0,
    stageLabel: "Waiting to start",
    detail: "Saved on this device and waiting for its turn.",
    runtime: "wasm",
    duration: 0,
    fileStoreKey: "status-project",
    marks: [],
    savedRanges: [],
  };
}

test("status defaults map to the new plain-English steps", () => {
  assert.equal(getDefaultProjectStep("queued"), "queued");
  assert.equal(getDefaultProjectStep("loading-model"), "getting-browser-ready");
  assert.equal(getDefaultProjectStep("preparing"), "getting-recording-ready");
  assert.equal(getDefaultProjectStep("transcribing"), "transcribing");
});

test("getProjectStatusCopy surfaces consistent launch copy", () => {
  const copy = getProjectStatusCopy({
    status: "loading-model",
    step: "getting-browser-ready",
    detail: "Downloading the one-time local tools this browser needs.",
  });

  assert.equal(copy.badgeLabel, "Setup");
  assert.equal(copy.headline, "Getting this browser ready");
  assert.match(copy.summary, /one-time local tools/i);
});

test("applyProjectStep keeps the headline and step in sync", () => {
  const nextProject = applyProjectStep(buildProject(), {
    status: "transcribing",
    step: "transcribing",
    progress: 72,
    detail: "Listening on this device and building the transcript.",
  });

  assert.equal(nextProject.status, "transcribing");
  assert.equal(nextProject.step, "transcribing");
  assert.equal(nextProject.stageLabel, "Transcribing now");
  assert.match(nextProject.detail, /listening on this device/i);
});
