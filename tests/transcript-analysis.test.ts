import assert from "node:assert/strict";
import test from "node:test";

import { buildTranscriptDocument, updateTranscriptSegmentText } from "@/lib/transcribble/analysis";
import type { TranscriptMark, TranscriptPayload } from "@/lib/transcribble/types";

const payload: TranscriptPayload = {
  text: "",
  chunks: [
    { text: "We need to ship the local library search next Tuesday.", timestamp: [0, 4.6] },
    { text: "Acme Labs will review the release notes for Transcribble.", timestamp: [5.1, 9.4] },
    { text: "What blockers are left before launch?", timestamp: [10.2, 13.6] },
    { text: "The search index keeps transcript memory reusable across interviews.", timestamp: [15.2, 19.9] },
    { text: "The search index also makes transcript memory reusable across meetings.", timestamp: [20.1, 24.8] },
    { text: "Acme Labs said the search index should stay local and inspectable.", timestamp: [25.6, 30.2] },
  ],
};

test("buildTranscriptDocument derives grounded local insights", () => {
  const marks: TranscriptMark[] = [
    {
      id: "bookmark-1",
      kind: "bookmark",
      segmentId: "project-1-segment-2",
      createdAt: new Date("2026-03-31T10:00:00Z").toISOString(),
      label: "Follow up",
    },
  ];

  const document = buildTranscriptDocument("project-1", payload, 30.2, marks);

  assert.ok(document.segments.length >= 4);
  assert.ok(document.turns.length >= 1);
  assert.ok(document.insights.summary.length > 0);
  assert.ok(document.insights.actions.some((item) => /ship the local library search/i.test(item.text)));
  assert.ok(document.insights.questions.some((item) => /blockers/i.test(item.text)));
  assert.ok(document.insights.dates.some((item) => /next tuesday/i.test(item.label)));
  assert.ok(document.insights.entities.some((item) => item.label === "Acme Labs"));
  assert.ok(document.insights.glossary.some((item) => item.term.includes("Search Index")));
  assert.equal(document.stats.bookmarkCount, 1);
  assert.ok(document.turns.every((turn) => turn.segmentIds.length > 0));
  assert.ok(document.turns.every((turn) => turn.attribution === "pause-derived"));
  assert.ok(
    document.insights.summary.every((item) =>
      document.segments.some((segment) => segment.id === item.reference.segmentId),
    ),
  );
});

test("updateTranscriptSegmentText rebuilds the searchable transcript document", () => {
  const document = buildTranscriptDocument("project-2", payload, 30.2);
  const firstSegment = document.segments[0];

  const nextDocument = updateTranscriptSegmentText(
    "project-2",
    document,
    firstSegment.id,
    "We should prioritize the offline queue before release.",
  );

  assert.match(nextDocument.plainText, /offline queue/i);
  assert.ok(nextDocument.insights.actions.some((item) => /offline queue/i.test(item.text)));
  assert.ok(nextDocument.searchEntries.some((entry) => /offline queue/i.test(entry.text)));
});
