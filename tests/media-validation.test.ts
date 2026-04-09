import assert from "node:assert/strict";
import test from "node:test";

import { getFileExtension, validateMediaFile } from "@/lib/transcribble/media";

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

test("validateMediaFile rejects unsupported extension", () => {
  const file = new File(["data"], "test.xyz", { type: "application/octet-stream" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("Unsupported"));
});

test("validateMediaFile rejects empty file", () => {
  const file = new File([], "test.mp3", { type: "audio/mpeg" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, false);
  assert.ok(result.error?.includes("empty"));
});

test("validateMediaFile accepts supported audio", () => {
  const file = new File(["audio-data"], "test.mp3", { type: "audio/mpeg" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, true);
  assert.equal(result.mediaKind, "audio");
  assert.equal(result.extension, ".mp3");
});

test("validateMediaFile accepts supported video", () => {
  const file = new File(["video-data"], "test.mp4", { type: "video/mp4" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, true);
  assert.equal(result.mediaKind, "video");
});

test("validateMediaFile accepts ogg format", () => {
  const file = new File(["audio-data"], "test.ogg", { type: "audio/ogg" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, true);
  assert.equal(result.mediaKind, "audio");
});

test("validateMediaFile accepts webm format", () => {
  const file = new File(["video-data"], "test.webm", { type: "video/webm" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, true);
  assert.equal(result.mediaKind, "video");
});

test("validateMediaFile accepts flac format", () => {
  const file = new File(["audio-data"], "test.flac", { type: "audio/flac" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, true);
  assert.equal(result.mediaKind, "audio");
});

test("validateMediaFile accepts aac format", () => {
  const file = new File(["audio-data"], "test.aac", { type: "audio/aac" });
  const result = validateMediaFile(file);
  assert.equal(result.ok, true);
  assert.equal(result.mediaKind, "audio");
});
