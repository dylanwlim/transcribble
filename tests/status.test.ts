import assert from "node:assert/strict";
import test from "node:test";

import { applyProjectStep, getDefaultProjectStep, getProjectStatusCopy, getProjectViewState } from "@/lib/transcribble/status";
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

function buildReadyProject(): TranscriptProject {
  return {
    ...buildProject(),
    status: "ready",
    step: "ready",
    progress: 100,
    stageLabel: "Ready to review",
    detail: "Saved on this device. Search, edit, and export whenever you need it.",
    transcript: {
      plainText: "hello world",
      chunks: [],
      segments: [],
      turns: [],
      chapters: [],
      insights: {
        summary: [],
        actions: [],
        questions: [],
        dates: [],
        entities: [],
        glossary: [],
        keyMoments: [],
        reviewCues: [],
      },
      stats: {
        duration: 12,
        wordCount: 2,
        characterCount: 11,
        segmentCount: 0,
        turnCount: 0,
        questionCount: 0,
        actionCount: 0,
        reviewCount: 0,
        bookmarkCount: 0,
        highlightCount: 0,
        speakingRateWpm: 0,
      },
      searchEntries: [],
      generatedAt: new Date("2026-03-31T09:01:00Z").toISOString(),
    },
  };
}

test("status defaults map to the new plain-English steps", () => {
  assert.equal(getDefaultProjectStep("queued"), "queued");
  assert.equal(getDefaultProjectStep("loading-model"), "getting-browser-ready");
  assert.equal(getDefaultProjectStep("preparing"), "getting-recording-ready");
  assert.equal(getDefaultProjectStep("transcribing"), "transcribing");
  assert.equal(getDefaultProjectStep("paused"), "paused");
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

test("getProjectViewState enables transcript controls only when the transcript is ready", () => {
  const view = getProjectViewState(buildReadyProject());

  assert.equal(view.canUseTranscript, true);
  assert.equal(view.canSearchTranscript, true);
  assert.equal(view.canExport, true);
  assert.equal(view.canSaveRanges, true);
  assert.equal(view.transcriptBadgeLabel, "Transcript ready");
});

test("getProjectViewState keeps failed sessions calm and non-optimistic", () => {
  const view = getProjectViewState({
    ...buildProject(),
    status: "error",
    step: "error",
    detail: "Transcribble could not reopen the saved recording. The recording is still saved on this device, and you can try again when you're ready.",
    error: "ENOENT: source file missing",
  });

  assert.equal(view.canUseTranscript, false);
  assert.equal(view.canSearchTranscript, false);
  assert.equal(view.canExport, false);
  assert.equal(view.canSaveRanges, false);
  assert.equal(view.statusLabel, "Problem");
  assert.equal(view.transcriptEmptyTitle, "This recording could not finish yet");
  assert.match(view.transcriptEmptyBody, /still saved on this device/i);
  assert.doesNotMatch(view.transcriptEmptyBody, /ENOENT/);
});

test("getProjectViewState explains paused local processing clearly", () => {
  const view = getProjectViewState({
    ...buildProject(),
    status: "paused",
    step: "paused",
    detail: "Saved on this device. This recording needs attention before transcription can continue.",
  });

  assert.equal(view.canUseTranscript, false);
  assert.equal(view.transcriptBadgeLabel, "Paused locally");
  assert.equal(view.transcriptEmptyTitle, "Paused locally");
  assert.match(view.transcriptEmptyBody, /saved on this device/i);
});

test("getProjectViewState explains when the local accelerator is required", () => {
  const view = getProjectViewState({
    ...buildProject(),
    status: "paused",
    step: "needs-local-helper",
    detail: "Large recordings need the Transcribble Helper running on this machine.",
  });

  assert.equal(view.canUseTranscript, false);
  assert.equal(view.transcriptBadgeLabel, "Local accelerator required");
  assert.equal(view.transcriptEmptyTitle, "Local accelerator required");
  assert.match(view.transcriptEmptyBody, /Transcribble Helper/i);
});
