import assert from "node:assert/strict";
import test from "node:test";

import {
  createProjectFromFile,
  recoverPersistedProjects,
  updateProjectTimestamp,
} from "@/lib/transcribble/projects";
import type { TranscriptProject } from "@/lib/transcribble/types";

test("createProjectFromFile creates a valid project", () => {
  const file = new File(["audio"], "meeting-notes.mp3", { type: "audio/mpeg" });
  const project = createProjectFromFile(file, "wasm");
  assert.ok(project.id);
  assert.equal(project.title, "meeting notes");
  assert.equal(project.sourceName, "meeting-notes.mp3");
  assert.equal(project.status, "queued");
  assert.equal(project.mediaKind, "audio");
  assert.equal(project.runtime, "wasm");
  assert.deepEqual(project.marks, []);
  assert.deepEqual(project.savedRanges, []);
});

test("createProjectFromFile infers video for mp4", () => {
  const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
  const project = createProjectFromFile(file, "webgpu");
  assert.equal(project.mediaKind, "video");
});

test("createProjectFromFile infers video for webm with video type", () => {
  const file = new File(["video"], "clip.webm", { type: "video/webm" });
  const project = createProjectFromFile(file, "wasm");
  assert.equal(project.mediaKind, "video");
});

test("createProjectFromFile infers audio for webm with audio type", () => {
  const file = new File(["audio"], "recording.webm", { type: "audio/webm" });
  const project = createProjectFromFile(file, "wasm");
  assert.equal(project.mediaKind, "audio");
});

test("createProjectFromFile handles files with dashes and underscores", () => {
  const file = new File(["audio"], "my_meeting-2024_01.mp3", { type: "audio/mpeg" });
  const project = createProjectFromFile(file, "wasm");
  assert.equal(project.title, "my meeting 2024 01");
});

test("createProjectFromFile defaults title for extensionless name", () => {
  const file = new File(["audio"], ".mp3", { type: "audio/mpeg" });
  const project = createProjectFromFile(file, "wasm");
  assert.equal(project.title, "Untitled Session");
});

test("recoverPersistedProjects marks in-progress projects as queued", () => {
  const projects: TranscriptProject[] = [
    makeProject({ status: "transcribing", progress: 50, stageLabel: "Transcribing" }),
    makeProject({ id: "2", status: "ready", progress: 100, stageLabel: "Ready" }),
  ];
  const recovered = recoverPersistedProjects(projects);
  assert.equal(recovered[0].status, "queued");
  assert.equal(recovered[0].progress, 0);
  assert.equal(recovered[1].status, "ready");
  assert.equal(recovered[1].progress, 100);
});

test("recoverPersistedProjects keeps error and paused projects", () => {
  const projects: TranscriptProject[] = [
    makeProject({ status: "error", stageLabel: "Error" }),
    makeProject({ id: "2", status: "paused", stageLabel: "Paused" }),
  ];
  const recovered = recoverPersistedProjects(projects);
  assert.equal(recovered[0].status, "error");
  assert.equal(recovered[1].status, "paused");
});

test("updateProjectTimestamp updates the updatedAt field", () => {
  const project = makeProject({});
  const before = project.updatedAt;
  const updated = updateProjectTimestamp(project);
  assert.notEqual(updated.updatedAt, before);
});

function makeProject(overrides: Partial<TranscriptProject>): TranscriptProject {
  return {
    id: overrides.id ?? "1",
    title: overrides.title ?? "Test",
    sourceName: overrides.sourceName ?? "test.mp3",
    sourceType: overrides.sourceType ?? "audio/mpeg",
    sourceSize: overrides.sourceSize ?? 1024,
    mediaKind: overrides.mediaKind ?? "audio",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    status: overrides.status ?? "queued",
    progress: overrides.progress ?? 0,
    stageLabel: overrides.stageLabel ?? "Queued",
    detail: overrides.detail ?? "",
    runtime: overrides.runtime ?? "wasm",
    fileStoreKey: overrides.fileStoreKey ?? overrides.id ?? "1",
    marks: overrides.marks ?? [],
    savedRanges: overrides.savedRanges ?? [],
  };
}
