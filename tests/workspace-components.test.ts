import assert from "node:assert/strict";
import test from "node:test";

import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EMPTY_STATE_COPY, SETTINGS_MODAL_TITLE } from "@/lib/transcribble/constants";
import { EmptyState } from "@/components/workspace/empty-state";
import { SettingsSheet } from "@/components/workspace/settings-sheet";
import { Sidebar } from "@/components/workspace/sidebar";

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
    }),
  );

  assert.match(html, /<button[^>]*aria-label="Open setup and settings"/);
  assert.match(html, />Setup</);
  assert.match(html, /202 MB used/);
  assert.match(html, /2\.0 GB available/);
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
    }),
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, new RegExp(SETTINGS_MODAL_TITLE));
  assert.match(html, /Close settings/);
});

test("empty state copy keeps the local-first em dash copy", () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      onImport: () => undefined,
      onPrimeSetup: () => undefined,
      setupReady: false,
      warming: false,
      online: true,
      supportedFormats: ["MP3", "MP4", "M4A", "WAV"],
    }),
  );

  assert.ok(html.includes(EMPTY_STATE_COPY));
  assert.doesNotMatch(html, /here - searchable/);
});
