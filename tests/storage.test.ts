import assert from "node:assert/strict";
import test from "node:test";

import {
  OPFS_MEDIA_THRESHOLD_BYTES,
  buildStorageStatus,
  chooseMediaStorageBackend,
  createOpfsFileName,
  estimateRequiredLocalStorage,
  readBrowserStorageState,
  sanitizeStorageName,
  validateLocalStorageCapacity,
} from "@/lib/transcribble/storage";

test("larger media prefers OPFS when it is available", () => {
  assert.equal(chooseMediaStorageBackend(OPFS_MEDIA_THRESHOLD_BYTES - 1, true), "indexeddb");
  assert.equal(chooseMediaStorageBackend(OPFS_MEDIA_THRESHOLD_BYTES, true), "opfs");
  assert.equal(chooseMediaStorageBackend(OPFS_MEDIA_THRESHOLD_BYTES * 2, false), "indexeddb");
});

test("opfs file names stay stable and filesystem-safe", () => {
  assert.equal(sanitizeStorageName("Launch Review 2026"), "launch-review-2026");
  assert.equal(createOpfsFileName("Project 01", "Team Sync.MP4"), "project-01.mp4");
});

test("buildStorageStatus keeps sidebar and modal copy consistent", () => {
  const used = 202 * 1024 * 1024;
  const available = 2 * 1024 * 1024 * 1024;
  const result = buildStorageStatus(used, available);

  assert.equal(result.usedLabel, "202 MB used");
  assert.equal(result.availableLabel, "2.0 GB available");
  assert.equal(result.summary, "202 MB used · 2.0 GB available");
});

test("validateLocalStorageCapacity accepts large files when headroom is sufficient", async () => {
  const result = await validateLocalStorageCapacity(1.1 * 1024 * 1024 * 1024, {
    persistenceSupported: true,
    canRequestPersistence: true,
    persisted: true,
    usage: 202 * 1024 * 1024,
    available: 2.4 * 1024 * 1024 * 1024,
    quota: 2.6 * 1024 * 1024 * 1024,
    usageRatio: 0,
    opfsSupported: true,
    preferredMediaBackend: "opfs",
    caveats: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.backend, "opfs");
  assert.ok((result.requiredBytes ?? 0) > 1.1 * 1024 * 1024 * 1024);
});

test("validateLocalStorageCapacity rejects when available storage is too low", async () => {
  const fileSize = 1.1 * 1024 * 1024 * 1024;
  const result = await validateLocalStorageCapacity(fileSize, {
    persistenceSupported: true,
    canRequestPersistence: true,
    persisted: false,
    usage: 350 * 1024 * 1024,
    available: 700 * 1024 * 1024,
    quota: 1.05 * 1024 * 1024 * 1024,
    usageRatio: 0.33,
    opfsSupported: true,
    preferredMediaBackend: "opfs",
    caveats: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.backend, "opfs");
  assert.equal(result.requiredBytes, estimateRequiredLocalStorage(fileSize, "opfs"));
});

test("readBrowserStorageState reports zero usage ratio", async () => {
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      storage: {
        persisted: async () => true,
        persist: async () => true,
        estimate: async () => ({ usage: 0, quota: 1024 }),
        getDirectory: async () => ({}) as FileSystemDirectoryHandle,
      },
    },
  });

  try {
    const state = await readBrowserStorageState();
    assert.equal(state.usageRatio, 0);
    assert.equal(state.available, 1024);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});
