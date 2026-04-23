import assert from "node:assert/strict";
import test from "node:test";

import {
  SETTINGS_PRIVACY_COPY,
  SUPPORTED_FORMAT_LABELS,
  UNSUPPORTED_FILE_TYPE_MESSAGE,
} from "@/lib/transcribble/constants";
import {
  getFileExtension,
  getSupportedFormatLabels,
  validateMediaFile,
  validateMediaImport,
} from "@/lib/transcribble/media";
import type { BrowserStorageState } from "@/lib/transcribble/storage";

test("getFileExtension extracts extension", () => {
  assert.equal(getFileExtension("audio.mp3"), ".mp3");
});

test("getFileExtension handles uppercase", () => {
  assert.equal(getFileExtension("AUDIO.MP3"), ".mp3");
});

test("getFileExtension handles no extension", () => {
  assert.equal(getFileExtension("noext"), "");
});

test("getFileExtension handles multiple dots", () => {
  assert.equal(getFileExtension("my.file.wav"), ".wav");
});

test("validateMediaFile rejects null", () => {
  const result = validateMediaFile(null);
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("validateMediaFile rejects unsupported extension with shared copy", () => {
  const file = new File(["data"], "test.xyz", { type: "application/octet-stream" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, false);
  assert.equal(result.error, UNSUPPORTED_FILE_TYPE_MESSAGE);
});

test("validateMediaFile rejects empty file", () => {
  const file = new File([], "test.mp3", { type: "audio/mpeg" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("empty"));
});

test("validateMediaFile does not enforce a fixed 200 MB cap", () => {
  const file = makeSizedFile("quarter-gig.mp4", "video/mp4", 250 * 1024 * 1024);
  const result = validateMediaFile(file);
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.error ?? "", /200 MB/i);
});

test("validateMediaImport accepts a 1.1 GB mp4 when quota is sufficient", async () => {
  const file = makeSizedFile("March 3 Meeting.mp4", "video/mp4", 1.1 * 1024 * 1024 * 1024);
  const result = await validateMediaImport(
    file,
    makeStorageState({
      usage: 202 * 1024 * 1024,
      available: 2.4 * 1024 * 1024 * 1024,
      quota: 2.6 * 1024 * 1024 * 1024,
      opfsSupported: true,
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.mediaKind, "video");
  assert.equal(result.extension, ".mp4");
});

test("validateMediaImport accepts all supported extensions", async () => {
  for (const format of SUPPORTED_FORMAT_LABELS) {
    const extension = `.${format.toLowerCase()}`;
    const file = makeSizedFile(`sample${extension}`, `audio/${format.toLowerCase()}`, 4096);
    const result = await validateMediaImport(file, makeStorageState());
    assert.equal(result.ok, true, `${extension} should be accepted`);
  }
});

test("validateMediaImport rejects insufficient quota with dynamic storage copy", async () => {
  const file = makeSizedFile("meeting.mp4", "video/mp4", 1.1 * 1024 * 1024 * 1024);
  const result = await validateMediaImport(
    file,
    makeStorageState({
      usage: 512 * 1024 * 1024,
      available: 700 * 1024 * 1024,
      quota: 1.2 * 1024 * 1024 * 1024,
      opfsSupported: true,
    }),
  );

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Not enough local storage for this recording/i);
  assert.match(result.error ?? "", /available local storage is about/i);
  assert.doesNotMatch(result.error ?? "", /uploads under 200 MB/i);
});

test("supported format labels stay aligned with the UI helper", () => {
  assert.deepEqual(getSupportedFormatLabels(), SUPPORTED_FORMAT_LABELS);
});

test("shared copy removes the old upload language", () => {
  assert.doesNotMatch(UNSUPPORTED_FILE_TYPE_MESSAGE, /upload/i);
  assert.doesNotMatch(SETTINGS_PRIVACY_COPY, /cloud transcription/i);
  assert.match(SETTINGS_PRIVACY_COPY, /local accelerator/i);
});

function makeSizedFile(name: string, type: string, size: number) {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", {
    configurable: true,
    value: size,
  });
  return file;
}

function makeStorageState(overrides: Partial<BrowserStorageState> = {}): BrowserStorageState {
  return {
    persistenceSupported: true,
    canRequestPersistence: true,
    persisted: true,
    usage: overrides.usage ?? 0,
    available: overrides.available ?? 4 * 1024 * 1024 * 1024,
    quota: overrides.quota ?? 4 * 1024 * 1024 * 1024,
    usageRatio: 0,
    opfsSupported: overrides.opfsSupported ?? true,
    preferredMediaBackend: "opfs",
    caveats: [],
    ...overrides,
  };
}
