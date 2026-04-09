import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranscriptSegments,
  clampTime,
  countCharacters,
  countWords,
  formatBytes,
  formatDuration,
  getSegmentReviewReasons,
  normalizeSearchText,
  tokenizeText,
  buildSegmentTextState,
} from "@/lib/transcribble/transcript";
import type { TranscriptPayload } from "@/lib/transcribble/types";

test("formatDuration handles zero", () => {
  assert.equal(formatDuration(0), "0:00");
});

test("formatDuration formats seconds", () => {
  assert.equal(formatDuration(65), "1:05");
});

test("formatDuration formats hours", () => {
  assert.equal(formatDuration(3661), "1:01:01");
});

test("formatDuration handles negative", () => {
  assert.equal(formatDuration(-5), "0:00");
});

test("formatDuration handles NaN", () => {
  assert.equal(formatDuration(NaN), "0:00");
});

test("formatDuration handles Infinity", () => {
  assert.equal(formatDuration(Infinity), "0:00");
});

test("formatBytes handles zero", () => {
  assert.equal(formatBytes(0), "0 B");
});

test("formatBytes formats kilobytes", () => {
  assert.equal(formatBytes(1536), "1.5 KB");
});

test("formatBytes formats megabytes", () => {
  assert.equal(formatBytes(10485760), "10 MB");
});

test("formatBytes handles negative", () => {
  assert.equal(formatBytes(-1), "0 B");
});

test("countWords counts space-separated tokens", () => {
  assert.equal(countWords("hello world foo"), 3);
});

test("countWords returns zero for empty string", () => {
  assert.equal(countWords(""), 0);
});

test("countWords handles whitespace-only", () => {
  assert.equal(countWords("   \t  "), 0);
});

test("countCharacters counts all characters", () => {
  assert.equal(countCharacters("hello"), 5);
});

test("normalizeSearchText lowercases and strips punctuation", () => {
  assert.equal(normalizeSearchText("Hello, World!"), "hello  world ");
});

test("tokenizeText extracts lowercase tokens", () => {
  const tokens = tokenizeText("Hello World 123");
  assert.ok(tokens.includes("hello"));
  assert.ok(tokens.includes("world"));
  assert.ok(tokens.includes("123"));
});

test("tokenizeText returns empty for empty input", () => {
  assert.deepEqual(tokenizeText(""), []);
});

test("clampTime clamps to zero for negative", () => {
  assert.equal(clampTime(-5, 100), 0);
});

test("clampTime clamps to duration", () => {
  assert.equal(clampTime(150, 100), 100);
});

test("clampTime handles NaN", () => {
  assert.equal(clampTime(NaN), 0);
});

test("clampTime returns time when no duration", () => {
  assert.equal(clampTime(50), 50);
});

test("getSegmentReviewReasons detects long unpunctuated segments", () => {
  const text = Array.from({ length: 20 }, () => "word").join(" ");
  const reasons = getSegmentReviewReasons(text);
  assert.ok(reasons.some((r) => /punctuation/i.test(r)));
});

test("getSegmentReviewReasons detects repeated words", () => {
  const reasons = getSegmentReviewReasons("the the repeated word");
  assert.ok(reasons.some((r) => /repeated/i.test(r)));
});

test("getSegmentReviewReasons detects filler words", () => {
  const reasons = getSegmentReviewReasons("I um was uh thinking um about it.");
  assert.ok(reasons.some((r) => /filler/i.test(r)));
});

test("getSegmentReviewReasons detects long numbers", () => {
  const reasons = getSegmentReviewReasons("The code is 12345678.");
  assert.ok(reasons.some((r) => /numeric/i.test(r)));
});

test("getSegmentReviewReasons returns empty for clean text", () => {
  const reasons = getSegmentReviewReasons("This is a clean sentence.");
  assert.equal(reasons.length, 0);
});

test("buildSegmentTextState produces consistent state", () => {
  const state = buildSegmentTextState("  Hello  world.  ");
  assert.equal(state.text, "Hello world.");
  assert.equal(state.wordCount, 2);
  assert.ok(state.tokens.includes("hello"));
  assert.ok(state.searchText.includes("hello"));
});

test("buildTranscriptSegments handles empty chunks", () => {
  const payload: TranscriptPayload = { text: "", chunks: [] };
  const segments = buildTranscriptSegments("test", payload);
  assert.equal(segments.length, 0);
});

test("buildTranscriptSegments falls back to plain text", () => {
  const payload: TranscriptPayload = { text: "First paragraph.\n\nSecond paragraph." };
  const segments = buildTranscriptSegments("test", payload);
  assert.ok(segments.length >= 2);
  assert.match(segments[0].text, /first paragraph/i);
});

test("buildTranscriptSegments creates segments from chunks", () => {
  const payload: TranscriptPayload = {
    text: "",
    chunks: [
      { text: "Hello world.", timestamp: [0, 2] },
      { text: "How are you?", timestamp: [2.5, 5] },
    ],
  };
  const segments = buildTranscriptSegments("test", payload);
  assert.ok(segments.length >= 1);
  assert.ok(segments[0].start >= 0);
  assert.ok(segments[0].end > segments[0].start);
});

test("buildTranscriptSegments creates new turn on large gap", () => {
  const payload: TranscriptPayload = {
    text: "",
    chunks: [
      { text: "First part.", timestamp: [0, 2] },
      { text: "After long pause.", timestamp: [10, 13] },
    ],
  };
  const segments = buildTranscriptSegments("test", payload);
  const turnIndices = new Set(segments.map((s) => s.turnIndex));
  assert.ok(turnIndices.size >= 2, "Should create multiple turns for large gap");
});

test("buildTranscriptSegments handles null end timestamps", () => {
  const payload: TranscriptPayload = {
    text: "",
    chunks: [
      { text: "Hello.", timestamp: [0, null] },
      { text: "World.", timestamp: [2, null] },
    ],
  };
  const segments = buildTranscriptSegments("test", payload);
  assert.ok(segments.length >= 1);
  assert.ok(segments[0].end > segments[0].start);
});
