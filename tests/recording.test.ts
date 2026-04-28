import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLiveTranscriptText,
  buildRecordingFileName,
  chooseRecordingMimeType,
  formatRecordingTimer,
  formatRecordingTitle,
  getRecordingFileExtension,
  mergeLiveTranscriptParts,
  resampleRecordingEnvelope,
} from "@/lib/transcribble/recording";

test("chooseRecordingMimeType follows the safe preference order", () => {
  const support = {
    isTypeSupported: (mimeType: string) => mimeType === "audio/webm" || mimeType === "audio/ogg",
  };

  assert.equal(chooseRecordingMimeType(support), "audio/webm");
});

test("chooseRecordingMimeType returns undefined for MediaRecorder default fallback", () => {
  assert.equal(chooseRecordingMimeType(null), undefined);
  assert.equal(chooseRecordingMimeType({}), undefined);
});

test("getRecordingFileExtension maps recording MIME types to safe extensions", () => {
  assert.equal(getRecordingFileExtension("audio/webm;codecs=opus"), "webm");
  assert.equal(getRecordingFileExtension("audio/mp4"), "m4a");
  assert.equal(getRecordingFileExtension("audio/ogg;codecs=opus"), "ogg");
  assert.equal(getRecordingFileExtension(undefined), "webm");
});

test("recording file names are timestamped and extension-aware", () => {
  const startedAt = new Date("2026-04-28T15:01:02.345Z");

  assert.equal(buildRecordingFileName(startedAt, "audio/ogg"), "Recording 2026-04-28T15-01-02.ogg");
});

test("formatRecordingTitle creates the visible generated recording title", () => {
  const startedAt = new Date("2026-04-28T15:01:00.000Z");

  assert.match(formatRecordingTitle(startedAt), /^Recording Apr 28, 2026,? /);
});

test("formatRecordingTimer renders centisecond precision", () => {
  assert.equal(formatRecordingTimer(0), "00:00.00");
  assert.equal(formatRecordingTimer(61_234), "01:01.23");
});

test("mergeLiveTranscriptParts appends final speech and separates interim text", () => {
  const merged = mergeLiveTranscriptParts("Hello", [
    { transcript: "this is final", isFinal: true },
    { transcript: "still speaking", isFinal: false },
  ]);

  assert.equal(merged.finalText, "Hello this is final");
  assert.equal(merged.interimText, "still speaking");
  assert.equal(buildLiveTranscriptText(merged.finalText, merged.interimText), "Hello this is final still speaking");
});

test("resampleRecordingEnvelope preserves peaks in bounded arrays", () => {
  const result = resampleRecordingEnvelope([0, 0.2, 0.9, 0.1, 0.4, 0.3], 3);

  assert.deepEqual(result, [0.2, 0.9, 0.4]);
});
