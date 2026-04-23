import {
  buildSegmentTextState,
  buildPlainTextFromSegments,
  buildTranscriptSegments,
  countCharacters,
  countWords,
  createSegmentReference,
  normalizeSearchText,
  titleCase,
} from "@/lib/transcribble/transcript";
import type {
  ActionItem,
  DateItem,
  ExtractedEntity,
  GlossaryEntry,
  KeyMoment,
  ProjectSearchEntry,
  QuestionItem,
  ReviewCue,
  SummaryItem,
  TranscriptChapter,
  TranscriptDocument,
  TranscriptInsights,
  TranscriptMark,
  TranscriptPayload,
  TranscriptSegment,
  TranscriptStats,
  TranscriptTurn,
} from "@/lib/transcribble/types";

const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "for",
  "from",
  "get",
  "got",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "me",
  "more",
  "most",
  "my",
  "no",
  "not",
  "now",
  "of",
  "on",
  "one",
  "or",
  "our",
  "out",
  "really",
  "right",
  "so",
  "some",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "too",
  "up",
  "us",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

const ACTION_PATTERN =
  /\b(need to|needs to|should|must|follow up|send|review|schedule|confirm|share|prepare|draft|update|ship|fix|investigate|check|reach out|call|email|circle back|sync|decide|finalize|document|track|assign)\b/i;
const OWNER_PATTERN = /^\s*(i|we|you|they|he|she|[A-Z][a-z]+)\s+(?:will|should|need to|needs to|must|can)\b/i;
const QUESTION_START_PATTERN = /^(who|what|when|where|why|how|can|could|should|would|is|are|do|does|did)\b/i;
const MONTH_PATTERN =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b/gi;
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const SLASH_DATE_PATTERN = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;
const RELATIVE_DATE_PATTERN =
  /\b(today|tomorrow|next week|next month|this week|this month|(?:next\s+)?monday|(?:next\s+)?tuesday|(?:next\s+)?wednesday|(?:next\s+)?thursday|(?:next\s+)?friday|(?:next\s+)?saturday|(?:next\s+)?sunday)\b/gi;
const CAPITALIZED_PHRASE_PATTERN = /\b(?:[A-Z][a-z0-9&.-]+(?:\s+[A-Z][a-z0-9&.-]+){0,3})\b/g;
const ORGANIZATION_SUFFIX_PATTERN = /\b(Inc|LLC|Ltd|Corp|Corporation|Company|University|Committee|Agency|Labs|Lab|Studio|Team)\b/;
const PRODUCT_HINT_PATTERN = /\b(API|SDK|App|GPT|Whisper|Pro|v\d+)\b/;

interface ScoredSegment {
  segment: TranscriptSegment;
  score: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function toSentenceList(text: string) {
  return text
    .match(/[^.!?]+[.!?]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [text.trim()].filter(Boolean);
}

function compressSentence(text: string) {
  const sentence = toSentenceList(text)[0] ?? text;
  return sentence.replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function makeTermFrequency(segments: TranscriptSegment[]) {
  const frequencies = new Map<string, number>();

  for (const segment of segments) {
    const uniqueTokens = new Set(segment.tokens.filter((token) => token.length > 2 && !STOPWORDS.has(token)));

    for (const token of uniqueTokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }

  return frequencies;
}

function topTermsForSegments(segments: TranscriptSegment[], limit: number) {
  const counts = new Map<string, number>();

  for (const segment of segments) {
    for (const token of segment.tokens) {
      if (token.length <= 2 || STOPWORDS.has(token)) {
        continue;
      }

      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => titleCase(token));
}

function scoreSegments(segments: TranscriptSegment[]) {
  const frequencies = makeTermFrequency(segments);

  return segments.map((segment, index) => {
    let score = 0;

    for (const token of segment.tokens) {
      if (token.length <= 2 || STOPWORDS.has(token)) {
        continue;
      }

      score += frequencies.get(token) ?? 0;
    }

    if (segment.reviewReasons.length === 0) {
      score += 1;
    }

    if (/[0-9]/.test(segment.text)) {
      score += 2;
    }

    if (/\?/.test(segment.text)) {
      score += 2;
    }

    if (ACTION_PATTERN.test(segment.text)) {
      score += 3;
    }

    if (index === 0 || index === segments.length - 1) {
      score += 1;
    }

    return {
      segment,
      score,
    };
  });
}

function buildSearchEntries(segments: TranscriptSegment[]): ProjectSearchEntry[] {
  return segments.map((segment) => ({
    segmentId: segment.id,
    start: segment.start,
    end: segment.end,
    text: segment.text,
    normalizedText: segment.searchText,
    tokens: segment.tokens,
  }));
}

function buildTurns(projectId: string, segments: TranscriptSegment[]) {
  const turns: TranscriptTurn[] = [];
  let currentSegments: TranscriptSegment[] = [];
  let currentTurnIndex = segments[0]?.turnIndex ?? 0;

  const flush = () => {
    if (currentSegments.length === 0) {
      return;
    }

    const plainText = buildPlainTextFromSegments(currentSegments);

    turns.push({
      id: `${projectId}-turn-${turns.length + 1}`,
      index: currentTurnIndex,
      start: currentSegments[0]?.start ?? 0,
      end: currentSegments.at(-1)?.end ?? currentSegments[0]?.end ?? 0,
      segmentIds: currentSegments.map((segment) => segment.id),
      wordCount: countWords(plainText),
      characterCount: countCharacters(plainText),
      attribution: "pause-derived",
    });
  };

  for (const segment of segments) {
    if (currentSegments.length > 0 && segment.turnIndex !== currentTurnIndex) {
      flush();
      currentSegments = [];
    }

    currentTurnIndex = segment.turnIndex;
    currentSegments.push(segment);
  }

  flush();

  return turns;
}

function inferOwner(text: string) {
  const match = OWNER_PATTERN.exec(text);
  if (!match?.[1]) {
    return undefined;
  }

  const owner = match[1];
  return owner.length === 1 ? owner.toUpperCase() : titleCase(owner);
}

function normalizeDateLabel(label: string) {
  const lower = label.toLowerCase();
  const now = new Date();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  if (lower === "today") {
    return now.toISOString().slice(0, 10);
  }

  if (lower === "tomorrow") {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
  }

  const weekday = weekdays.find((day) => lower === day || lower === `next ${day}`);
  if (weekday) {
    const weekdayIndex = weekdays.indexOf(weekday);
    const next = new Date(now);
    const difference = (weekdayIndex - now.getDay() + 7) % 7;
    const offset = lower.startsWith("next ") ? difference + (difference === 0 ? 7 : 7) : difference === 0 ? 7 : difference;
    next.setDate(now.getDate() + offset);
    return next.toISOString().slice(0, 10);
  }

  if (ISO_DATE_PATTERN.test(label)) {
    return label;
  }

  if (SLASH_DATE_PATTERN.test(label)) {
    const [month, day, year] = label.split("/");
    const fullYear = year ? (year.length === 2 ? `20${year}` : year) : String(now.getFullYear());
    return `${fullYear.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = Date.parse(label);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString().slice(0, 10);
}

function extractActionItems(projectId: string, segments: TranscriptSegment[]) {
  const items: ActionItem[] = [];

  for (const segment of segments) {
    for (const sentence of toSentenceList(segment.text)) {
      if (!ACTION_PATTERN.test(sentence) && !/^\s*(let's|we'll|i'll)\b/i.test(sentence)) {
        continue;
      }

      const dateMatch =
        sentence.match(MONTH_PATTERN)?.[0] ??
        sentence.match(ISO_DATE_PATTERN)?.[0] ??
        sentence.match(SLASH_DATE_PATTERN)?.[0] ??
        sentence.match(RELATIVE_DATE_PATTERN)?.[0];

      items.push({
        id: `${segment.id}-action-${items.length + 1}`,
        text: truncateText(compressSentence(sentence), 180),
        owner: inferOwner(sentence),
        dueLabel: dateMatch ?? undefined,
        normalizedDate: dateMatch ? normalizeDateLabel(dateMatch) : undefined,
        reference: createSegmentReference(projectId, segment),
      });
    }
  }

  return items.slice(0, 12);
}

function extractQuestions(projectId: string, segments: TranscriptSegment[]) {
  const items: QuestionItem[] = [];

  for (const segment of segments) {
    for (const sentence of toSentenceList(segment.text)) {
      if (!sentence.includes("?") && !QUESTION_START_PATTERN.test(sentence)) {
        continue;
      }

      items.push({
        id: `${segment.id}-question-${items.length + 1}`,
        text: truncateText(compressSentence(sentence), 180),
        reference: createSegmentReference(projectId, segment),
      });
    }
  }

  return items.slice(0, 12);
}

function extractDates(projectId: string, segments: TranscriptSegment[]) {
  const items: DateItem[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const matches = [
      ...segment.text.matchAll(MONTH_PATTERN),
      ...segment.text.matchAll(ISO_DATE_PATTERN),
      ...segment.text.matchAll(SLASH_DATE_PATTERN),
      ...segment.text.matchAll(RELATIVE_DATE_PATTERN),
    ];

    for (const match of matches) {
      const label = match[0];
      const normalizedKey = `${segment.id}:${label.toLowerCase()}`;

      if (seen.has(normalizedKey)) {
        continue;
      }

      seen.add(normalizedKey);

      items.push({
        id: `${segment.id}-date-${items.length + 1}`,
        label,
        normalizedDate: normalizeDateLabel(label),
        reference: createSegmentReference(projectId, segment),
      });
    }
  }

  return items.slice(0, 16);
}

function classifyEntity(label: string) {
  if (ORGANIZATION_SUFFIX_PATTERN.test(label)) {
    return "organization" as const;
  }

  if (PRODUCT_HINT_PATTERN.test(label)) {
    return "product" as const;
  }

  if (label.split(" ").length >= 2) {
    return "person" as const;
  }

  return "term" as const;
}

function extractEntities(projectId: string, segments: TranscriptSegment[]) {
  const entities = new Map<string, ExtractedEntity>();

  for (const segment of segments) {
    const matches = segment.text.match(CAPITALIZED_PHRASE_PATTERN) ?? [];

    for (const match of matches) {
      if (match.length < 3) {
        continue;
      }

      const normalized = normalizeSearchText(match);
      if (!normalized || STOPWORDS.has(normalized)) {
        continue;
      }

      const existing = entities.get(normalized);
      const reference = createSegmentReference(projectId, segment);

      if (existing) {
        existing.count += 1;
        if (!existing.references.some((item) => item.segmentId === reference.segmentId)) {
          existing.references.push(reference);
        }
        continue;
      }

      entities.set(normalized, {
        id: `${projectId}-entity-${entities.size + 1}`,
        label: match,
        normalized,
        kind: classifyEntity(match),
        count: 1,
        references: [reference],
      });
    }
  }

  return [...entities.values()]
    .filter((entity) => entity.count >= 2 || entity.references.length >= 2)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 14);
}

function extractGlossary(projectId: string, segments: TranscriptSegment[]) {
  const counts = new Map<string, { count: number; references: Set<string> }>();

  for (const segment of segments) {
    const filtered = segment.tokens.filter((token) => token.length > 3 && !STOPWORDS.has(token));

    for (let index = 0; index < filtered.length; index += 1) {
      const unigram = filtered[index];
      const bigram = filtered[index + 1] ? `${filtered[index]} ${filtered[index + 1]}` : null;

      for (const candidate of [unigram, bigram]) {
        if (!candidate) {
          continue;
        }

        const value = counts.get(candidate) ?? { count: 0, references: new Set<string>() };
        value.count += 1;
        value.references.add(segment.id);
        counts.set(candidate, value);
      }
    }
  }

  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));

  return [...counts.entries()]
    .filter(([term, value]) => value.count >= 3 && value.references.size >= 2 && !term.includes("'"))
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([term, value], index): GlossaryEntry => ({
      id: `${projectId}-glossary-${index + 1}`,
      term: titleCase(term),
      count: value.count,
      references: [...value.references]
        .slice(0, 3)
        .map((segmentId) => {
          const segment = segmentMap.get(segmentId);
          return segment ? createSegmentReference(projectId, segment) : null;
        })
        .filter((reference): reference is NonNullable<typeof reference> => Boolean(reference)),
    }));
}

function buildSummary(projectId: string, scoredSegments: ScoredSegment[]) {
  const selected: SummaryItem[] = [];
  const reservedTurns = new Set<number>();

  for (const item of [...scoredSegments].sort((left, right) => right.score - left.score)) {
    if (selected.length >= 4) {
      break;
    }

    if (reservedTurns.has(item.segment.turnIndex) && item.score < 8) {
      continue;
    }

    reservedTurns.add(item.segment.turnIndex);

    selected.push({
      id: `${item.segment.id}-summary`,
      text: truncateText(compressSentence(item.segment.text), 160),
      reference: createSegmentReference(projectId, item.segment),
      score: item.score,
    });
  }

  return selected;
}

function buildKeyMoments(
  projectId: string,
  scoredSegments: ScoredSegment[],
  actions: ActionItem[],
  questions: QuestionItem[],
  dates: DateItem[],
) {
  const actionSegments = new Set(actions.map((item) => item.reference.segmentId));
  const questionSegments = new Set(questions.map((item) => item.reference.segmentId));
  const dateSegments = new Set(dates.map((item) => item.reference.segmentId));

  return [...scoredSegments]
    .sort((left, right) => right.score - left.score)
    .slice(0, 6)
    .map((item, index): KeyMoment => {
      let reason = "High-density discussion point";

      if (actionSegments.has(item.segment.id)) {
        reason = "Contains an action or next step";
      } else if (dateSegments.has(item.segment.id)) {
        reason = "Contains a date or timing reference";
      } else if (questionSegments.has(item.segment.id)) {
        reason = "Captures a key open question";
      }

      return {
        id: `${projectId}-moment-${index + 1}`,
        title: truncateText(compressSentence(item.segment.text), 72),
        reason,
        importance: item.score,
        reference: createSegmentReference(projectId, item.segment),
      };
    });
}

function buildReviewCues(projectId: string, segments: TranscriptSegment[]) {
  const cues: ReviewCue[] = [];

  for (const segment of segments) {
    for (const reason of segment.reviewReasons) {
      cues.push({
        id: `${segment.id}-cue-${cues.length + 1}`,
        label: "Needs review",
        reason,
        severity: reason.toLowerCase().includes("numeric") ? "medium" : "low",
        reference: createSegmentReference(projectId, segment),
      });
    }
  }

  return cues.slice(0, 16);
}

function buildChapters(projectId: string, segments: TranscriptSegment[], duration: number) {
  if (segments.length === 0) {
    return [] as TranscriptChapter[];
  }

  const totalWords = segments.reduce((sum, segment) => sum + segment.wordCount, 0);
  const targetChapterCount = clamp(Math.round(Math.max(duration / 300, totalWords / 260)), 1, 8);
  const wordsPerChapter = Math.max(140, Math.round(totalWords / targetChapterCount));
  const chapters: TranscriptChapter[] = [];

  let current: TranscriptSegment[] = [];
  let currentWords = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1];

    current.push(segment);
    currentWords += segment.wordCount;

    const gapToNext = next ? Math.max(0, next.start - segment.end) : 0;
    const shouldBreak =
      currentWords >= wordsPerChapter &&
      (gapToNext > 8 || currentWords >= wordsPerChapter * 1.35 || !next);

    if (!shouldBreak && next) {
      continue;
    }

    const titleTerms = topTermsForSegments(current, 2);
    const summary = truncateText(compressSentence(current[0]?.text ?? ""), 110);

    chapters.push({
      id: `${projectId}-chapter-${chapters.length + 1}`,
      index: chapters.length,
      title:
        titleTerms.length > 0
          ? titleTerms.join(" / ")
          : chapters.length === 0
            ? "Opening Context"
            : `Section ${chapters.length + 1}`,
      summary,
      start: current[0]?.start ?? 0,
      end: current.at(-1)?.end ?? current[0]?.end ?? 0,
      segmentIds: current.map((item) => item.id),
    });

    current = [];
    currentWords = 0;
  }

  return chapters;
}

function buildInsights(projectId: string, segments: TranscriptSegment[], scoredSegments: ScoredSegment[]): TranscriptInsights {
  const actions = extractActionItems(projectId, segments);
  const questions = extractQuestions(projectId, segments);
  const dates = extractDates(projectId, segments);

  return {
    summary: buildSummary(projectId, scoredSegments),
    actions,
    questions,
    dates,
    entities: extractEntities(projectId, segments),
    glossary: extractGlossary(projectId, segments),
    keyMoments: buildKeyMoments(projectId, scoredSegments, actions, questions, dates),
    reviewCues: buildReviewCues(projectId, segments),
  };
}

function buildStats(duration: number, segments: TranscriptSegment[], marks: TranscriptMark[], insights: TranscriptInsights): TranscriptStats {
  const plainText = buildPlainTextFromSegments(segments);
  const wordCount = countWords(plainText);
  const bookmarkCount = marks.filter((mark) => mark.kind === "bookmark").length;
  const highlightCount = marks.filter((mark) => mark.kind === "highlight").length;

  return {
    duration,
    wordCount,
    characterCount: countCharacters(plainText),
    segmentCount: segments.length,
    turnCount: new Set(segments.map((segment) => segment.turnIndex)).size,
    questionCount: insights.questions.length,
    actionCount: insights.actions.length,
    reviewCount: insights.reviewCues.length,
    bookmarkCount,
    highlightCount,
    speakingRateWpm: duration > 0 ? Math.round(wordCount / (duration / 60)) : 0,
  };
}

function buildTranscriptDocumentFromSegments(
  projectId: string,
  segments: TranscriptSegment[],
  duration: number,
  chunks: TranscriptPayload["chunks"],
  marks: TranscriptMark[],
): TranscriptDocument {
  const plainText = buildPlainTextFromSegments(segments);
  const scoredSegments = scoreSegments(segments);
  const turns = buildTurns(projectId, segments);
  const insights = buildInsights(projectId, segments, scoredSegments);

  return {
    plainText,
    chunks: chunks ?? [],
    segments,
    turns,
    chapters: buildChapters(projectId, segments, duration),
    insights,
    stats: buildStats(duration, segments, marks, insights),
    searchEntries: buildSearchEntries(segments),
    generatedAt: new Date().toISOString(),
  };
}

export function buildTranscriptDocument(
  projectId: string,
  payload: TranscriptPayload,
  duration: number,
  marks: TranscriptMark[] = [],
) {
  const segments = buildTranscriptSegments(projectId, payload);
  return buildTranscriptDocumentFromSegments(projectId, segments, duration, payload.chunks, marks);
}

export function rebuildTranscriptDocument(
  projectId: string,
  segments: TranscriptSegment[],
  duration: number,
  chunks: TranscriptPayload["chunks"],
  marks: TranscriptMark[] = [],
) {
  return buildTranscriptDocumentFromSegments(projectId, segments, duration, chunks, marks);
}

export function updateTranscriptSegmentText(
  projectId: string,
  document: TranscriptDocument,
  segmentId: string,
  nextText: string,
  marks: TranscriptMark[] = [],
) {
  const segments = document.segments.map((segment) => {
    if (segment.id !== segmentId) return segment;
    const textState = buildSegmentTextState(nextText);
    const originalText = segment.originalText ?? segment.text;
    const revertingToOriginal = textState.text === originalText;
    return {
      ...segment,
      ...textState,
      originalText: revertingToOriginal ? undefined : originalText,
    };
  });

  const next = rebuildTranscriptDocument(projectId, segments, document.stats.duration, document.chunks, marks);
  return document.envelope ? { ...next, envelope: document.envelope } : next;
}
