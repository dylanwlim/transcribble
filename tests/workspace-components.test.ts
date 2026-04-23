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
import { SettingsSheet } from "@/components/workspace/settings-sheet";
import { Sidebar } from "@/components/workspace/sidebar";
import { shouldRenderTurnHeader } from "@/components/workspace/transcript-pane";

test("sidebar renders setup as a real button with the shared settings label", () => {
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
      storageUsedBytes: 202 * 1024 * 1024,
      storageAvailableBytes: 2 * 1024 * 1024 * 1024,
      storagePersisted: true,
      modelReady: true,
      mediaReady: true,
      online: true,
      helperAvailable: false,
      helperSummary: "Large recordings need the local accelerator",
    }),
  );

  assert.match(html, /<button[^>]*aria-label="Open setup and settings"/);
  assert.match(html, />Setup</);
  assert.match(html, /202 MB used/);
  assert.match(html, /2\.0 GB available/);
  assert.match(html, /Browser tools ready/);
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

test("empty state copy keeps the local-first em dash copy", () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      onImport: () => undefined,
      onPrimeSetup: () => undefined,
      onOpenSettings: () => undefined,
      setupReady: false,
      warming: false,
      online: true,
      helperAvailable: false,
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
