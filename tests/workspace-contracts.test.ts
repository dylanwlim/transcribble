import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import manifest from "@/app/manifest";
import { hasExternalFileDrag } from "@/lib/transcribble/drag-and-drop";
import { getLaunchAction, removeLaunchActionFromUrl } from "@/lib/transcribble/launch-actions";
import { resolveLocalHelperStart } from "@/lib/transcribble/local-helper-state";
import { reorderProjectsById, sortProjects } from "@/lib/transcribble/project-order";
import { buildRecordingSaveFailureState, INITIAL_RECORDING_VIEW_STATE } from "@/lib/transcribble/recording";
import { createPersistedProjectSelection, resolveInitialProjectSelection } from "@/lib/transcribble/ui-state";
import {
  createWorkspaceBackup,
  prepareWorkspaceBackupImport,
  validateWorkspaceBackupPayload,
} from "@/lib/transcribble/workspace-backup";
import type { TranscriptProject } from "@/lib/transcribble/types";

test("library overview selection persists as a first-class view", () => {
  const projects = [makeProject({ id: "a" }), makeProject({ id: "b" })];

  assert.deepEqual(createPersistedProjectSelection(null), {
    activeView: "library",
    selectedProjectId: null,
  });
  assert.equal(resolveInitialProjectSelection(projects, { activeView: "library", selectedProjectId: null }), null);
  assert.equal(resolveInitialProjectSelection(projects, { selectedProjectId: null }), null);
  assert.equal(resolveInitialProjectSelection(projects, undefined), "a");
  assert.equal(resolveInitialProjectSelection(projects, { selectedProjectId: "missing" }), "a");
  assert.equal(resolveInitialProjectSelection([], { selectedProjectId: "a" }), null);
});

test("manual order is shared by sidebar and All Recordings without copying pinned state", () => {
  const projects = [
    makeProject({ id: "one", sortOrder: 0, pinned: true }),
    makeProject({ id: "two", sortOrder: 1, pinned: false }),
    makeProject({ id: "three", sortOrder: 2, pinned: false }),
  ];

  const reordered = reorderProjectsById(projects, "three", "two", "before");
  const moved = reordered.find((project) => project.id === "three");

  assert.equal(moved?.pinned, false);
  assert.deepEqual(
    sortProjects(reordered).map((project) => project.id),
    ["one", "three", "two"],
  );
});

test("global drag overlay only reacts to external file drags", () => {
  assert.equal(
    hasExternalFileDrag({
      types: ["text/plain"] as unknown as DataTransfer["types"],
      files: { length: 0 } as FileList,
    }),
    false,
  );
  assert.equal(
    hasExternalFileDrag({
      types: ["Files"] as unknown as DataTransfer["types"],
      files: { length: 1 } as FileList,
    }),
    true,
  );
});

test("manifest Add Recording shortcut maps to a handled launch action", () => {
  const appManifest = manifest();
  assert.equal(appManifest.shortcuts?.[0]?.url, "/?action=add");
  assert.equal(getLaunchAction("?action=add"), "add");
  assert.equal(removeLaunchActionFromUrl("https://example.test/?source=pwa&action=add#top"), "/?source=pwa#top");
});

test("helper starts can use freshly resolved capabilities instead of stale state", () => {
  const stale = resolveLocalHelperStart(null);
  assert.equal(stale.available, false);

  const fresh = resolveLocalHelperStart({
    available: true,
    url: "http://127.0.0.1:7771",
    models: [],
  });

  assert.equal(fresh.available, true);
  assert.equal(fresh.url, "http://127.0.0.1:7771");
});

test("recording save failures reset saving state and keep retry available", () => {
  const state = buildRecordingSaveFailureState(
    { ...INITIAL_RECORDING_VIEW_STATE, status: "saving" },
    new Error("Failed to fetch"),
    true,
  );

  assert.equal(state.status, "error");
  assert.equal(state.canRetrySave, true);
  assert.doesNotMatch(state.error ?? "", /^Failed to fetch$/i);
  assert.match(state.error ?? "", /helper:start|helper:check/i);
});

test("workspace backup validates schema and round-trips project metadata with media", async () => {
  const project = makeProject({
    id: "original",
    fileStoreKey: "original-file",
    status: "ready",
    step: "ready",
  });
  const sourceFile = new File(["audio bytes"], "meeting.m4a", {
    type: "audio/mp4",
    lastModified: 1_777_000_000,
  });

  const backup = await createWorkspaceBackup([project], async () => sourceFile);
  const validation = validateWorkspaceBackupPayload(JSON.parse(JSON.stringify(backup)));
  assert.equal(validation.ok, true);
  assert.equal(backup.projects[0]?.media.status, "included");

  const prepared = await prepareWorkspaceBackupImport(validation.backup, []);
  assert.equal(prepared.summary.importedProjects, 1);
  assert.equal(prepared.summary.restoredMedia, 1);
  assert.equal(prepared.projects[0]?.title, "Project original");
  assert.equal(await prepared.files[0]?.file.text(), "audio bytes");
});

test("workspace backup rejects incompatible schema before import", () => {
  const validation = validateWorkspaceBackupPayload({
    app: "transcribble",
    version: 999,
    projects: [],
  });

  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.match(validation.error, /schema version/i);
  }
});

test("service worker keeps navigations network-first and avoids broad same-origin cache-first behavior", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

  assert.match(source, /networkFirstNavigation/);
  assert.match(source, /isHelperOrApiLikeRequest/);
  assert.doesNotMatch(source, /cached\s*\|\|\s*fetch\(request\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(source, /localhost/);
});

function makeProject(overrides: Partial<TranscriptProject>): TranscriptProject {
  return {
    id: overrides.id ?? "project",
    title: overrides.title ?? `Project ${overrides.id ?? "project"}`,
    sourceName: overrides.sourceName ?? "meeting.m4a",
    sourceType: overrides.sourceType ?? "audio/mp4",
    sourceSize: overrides.sourceSize ?? 1024,
    mediaKind: overrides.mediaKind ?? "audio",
    createdAt: overrides.createdAt ?? "2026-04-28T12:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-28T12:00:00.000Z",
    status: overrides.status ?? "ready",
    step: overrides.step ?? "ready",
    progress: overrides.progress ?? 100,
    stageLabel: overrides.stageLabel ?? "Ready to review",
    detail: overrides.detail ?? "Saved on this device.",
    runtime: overrides.runtime ?? "wasm",
    backend: overrides.backend ?? "browser",
    duration: overrides.duration,
    fileStoreKey: overrides.fileStoreKey ?? overrides.id ?? "project",
    marks: overrides.marks ?? [],
    savedRanges: overrides.savedRanges ?? [],
    pinned: overrides.pinned,
    sortOrder: overrides.sortOrder,
    transcript: overrides.transcript,
  };
}
