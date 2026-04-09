import assert from "node:assert/strict";
import test from "node:test";

import {
  OPFS_MEDIA_THRESHOLD_BYTES,
  chooseMediaStorageBackend,
  createOpfsFileName,
  sanitizeStorageName,
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
