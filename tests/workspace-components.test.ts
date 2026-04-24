import assert from "node:assert/strict";
import test from "node:test";

import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EMPTY_STATE_COPY,
  LOCAL_ACCELERATOR_CHECK_COMMAND,
  LOCAL_ACCELERATOR_INSTALL_COMMAND,
  LOCAL_ACCELERATOR_START_COMMAND,
  SETTINGS_MODAL_TITLE,
} from "@/lib/transcribble/constants";
import { EmptyState } from "@/components/workspace/empty-state";
import { Inspector } from "@/components/workspace/inspector";
import { SettingsSheet } from "@/components/workspace/settings-sheet";
import { Sidebar } from "@/components/workspace/sidebar";
import { TranscriptPane } from "@/components/workspace/transcript-pane";
import { shouldRenderTurnHeader } from "@/components/workspace/transcript-pane";

test("sidebar exposes the desktop app affordance and a calm status footer", () => {
  const html = renderToStaticMarkup(
    createElement(Sidebar, {
      projects: [],
      selectedProjectId: null,
      onSelect: () => undefined,
      onImport: () => undefined,
      libraryQuery: "",
      onLibraryQueryChange: () => undefined,
      searchResults: [],
      onOpenSearchResult: () => undefined,
      onRetry: () => undefined,
      onRemove: () => undefined,
      onRename: () => undefined,
      onTogglePin: () => undefined,
      onReorder: () => undefined,
      onToggleRecording: () => undefined,
      onOpenSettings: () => undefined,
      isRecording: false,
      librarySearchRef: createRef<HTMLInputElement>(),
      helperAvailable: true,
      storageUsedBytes: 202 * 1024 * 1024,
      storageAvailableBytes: 2 * 1024 * 1024 * 1024,
      storagePersisted: true,
      desktopAppInstalled: false,
      desktopInstallAvailable: false,
      onOpenDesktopApp: () => undefined,
    }),
  );

  assert.match(html, /Desktop app/);
  assert.match(html, /All Recordings/);
  assert.match(html, /Accelerator/);
  assert.match(html, /2\.0 GB free/);
  assert.match(html, /Settings/);
});

test("settings sheet renders the local workspace dialog heading", () => {
  const html = renderToStaticMarkup(
    createElement(SettingsSheet, {
      open: true,
      onClose: () => undefined,
      modelReady: false,
      mediaReady: false,
      warmingModel: false,
      warmingMedia: false,
      online: true,
      onPrimeModel: () => undefined,
      onPrimeMedia: () => undefined,
      onResetSetup: () => undefined,
      storagePersisted: false,
      storageUsed: 202 * 1024 * 1024,
      storageAvailable: 2 * 1024 * 1024 * 1024,
      storageCanRequestPersistence: true,
      onAskForPersistent: () => undefined,
      installPromptAvailable: false,
      installed: false,
      onInstall: () => undefined,
      helperAvailable: false,
      helperSummary: "Large recordings need the local accelerator",
      helperNextAction: "Run the helper install, start, and check commands in this repo.",
      helperUrl: "http://127.0.0.1:7771",
      helperBackendLabel: undefined,
      helperCacheLabel: "Model cache size unavailable",
      helperMaxParallelChunks: 1,
      helperModels: [],
      helperModelProfile: "fast",
      helperPhraseHints: "",
      helperSupportsAlignment: false,
      helperSupportsDiarization: false,
      helperAlignmentEnabled: false,
      helperDiarizationEnabled: false,
      onHelperModelProfileChange: () => undefined,
      onHelperPhraseHintsChange: () => undefined,
      onHelperAlignmentChange: () => undefined,
      onHelperDiarizationChange: () => undefined,
      onRefreshHelper: () => undefined,
    }),
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, new RegExp(SETTINGS_MODAL_TITLE));
  assert.match(html, /Close settings/);
  assert.match(html, new RegExp(LOCAL_ACCELERATOR_INSTALL_COMMAND));
  assert.match(html, new RegExp(LOCAL_ACCELERATOR_START_COMMAND));
  assert.match(html, new RegExp(LOCAL_ACCELERATOR_CHECK_COMMAND));
});

test("empty state copy keeps local-first import guidance", () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      onImport: () => undefined,
      desktopAppInstalled: false,
      desktopInstallAvailable: false,
      onOpenDesktopApp: () => undefined,
      supportedFormats: ["MP3", "MP4", "M4A", "WAV"],
    }),
  );

  assert.ok(html.includes(EMPTY_STATE_COPY));
  assert.doesNotMatch(html, /here - searchable/);
});

test("turn headers stay hidden until a speaker label exists", () => {
  assert.equal(
    shouldRenderTurnHeader({
      speakerLabel: undefined,
    }),
    false,
  );

  assert.equal(
    shouldRenderTurnHeader({
      speakerLabel: "Speaker A",
    }),
    true,
  );
});

test("transcript pane surfaces local-accelerator-required guidance instead of a generic empty state", () => {
  const html = renderToStaticMarkup(
    createElement(TranscriptPane, {
      project: {
        id: "helper-project",
        title: "March 3 Meeting",
        sourceName: "March 3 Meeting.mp4",
        sourceType: "video/mp4",
        sourceSize: 1.1 * 1024 * 1024 * 1024,
        mediaKind: "video",
        createdAt: new Date("2026-04-23T18:05:00Z").toISOString(),
        updatedAt: new Date("2026-04-23T18:05:00Z").toISOString(),
        status: "paused",
        step: "needs-local-helper",
        progress: 0,
        stageLabel: "Local accelerator required",
        detail:
          "Large or memory-heavy recordings need the Transcribble Helper running on this machine. Open Settings for the install and start steps, then retry.",
        runtime: "wasm",
        backend: "local-helper",
        fileStoreKey: "helper-project",
        marks: [],
        savedRanges: [],
      },
      segments: [],
      turns: [],
      focusedSegmentId: null,
      playbackSegmentId: null,
      marks: [],
      matchedSegmentIds: new Set<string>(),
      transcriptQuery: "",
      onTranscriptQueryChange: () => undefined,
      onSelectSegment: () => undefined,
      onUpdateSegmentText: () => undefined,
      onToggleBookmark: () => undefined,
      onJumpMatch: () => undefined,
      transcriptSearchRef: createRef<HTMLInputElement>(),
      partialTranscript: "",
      canSearch: false,
      canEdit: false,
    }),
  );

  assert.match(html, /Local accelerator required/);
  assert.match(html, /Transcribble Helper running on this machine/);
  assert.doesNotMatch(html, /No transcript yet\./);
});

test("inspector still renders base session details before a transcript exists", () => {
  const html = renderToStaticMarkup(
    createElement(Inspector, {
      project: {
        id: "paused-project",
        title: "April planning",
        sourceName: "April planning.m4a",
        sourceType: "audio/mp4",
        sourceSize: 18 * 1024 * 1024,
        mediaKind: "audio",
        createdAt: new Date("2026-04-23T18:05:00Z").toISOString(),
        updatedAt: new Date("2026-04-23T18:05:00Z").toISOString(),
        status: "paused",
        step: "needs-local-helper",
        progress: 0,
        stageLabel: "Local accelerator required",
        detail:
          "Large recordings need the Transcribble Helper running on this machine before transcription can continue.",
        runtime: "wasm",
        backend: "local-helper",
        fileStoreKey: "paused-project",
        marks: [],
        savedRanges: [],
      },
      marks: [],
      ranges: [],
      onClose: () => undefined,
      onJumpToSegment: () => undefined,
      onJumpToTime: () => undefined,
      onRemoveRange: () => undefined,
      onToggleHighlight: () => undefined,
      onExport: () => undefined,
    }),
  );

  assert.match(html, />Details</);
  assert.match(html, />About</);
  assert.match(html, /April planning\.m4a/);
  assert.match(html, />Size</);
  assert.doesNotMatch(html, /Open export/);
});
