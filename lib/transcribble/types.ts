import type { Runtime } from "@/lib/transcribble/constants";

export type ProjectStatus =
  | "queued"
  | "preparing"
  | "loading-model"
  | "transcribing"
  | "paused"
  | "ready"
  | "error";

export type MediaKind = "audio" | "video";

export type ReviewSeverity = "low" | "medium";

export type MarkKind = "bookmark" | "highlight";

export type HighlightColor = "amber" | "sky" | "rose";

export type EntityKind = "person" | "organization" | "product" | "term";

export type TurnAttribution = "pause-derived" | "manual" | "diarized";

export interface TranscriptChunk {
  text: string;
  timestamp: [number, number | null];
}

export interface TranscriptPayload {
  text: string;
  chunks?: TranscriptChunk[];
}

export interface TranscriptSegment {
  id: string;
  index: number;
  text: string;
  start: number;
  end: number;
  turnIndex: number;
  wordCount: number;
  characterCount: number;
  searchText: string;
  tokens: string[];
  reviewReasons: string[];
}

export interface TranscriptReference {
  projectId: string;
  segmentId: string;
  start: number;
  end: number;
  excerpt: string;
}

export interface TranscriptMark {
  id: string;
  kind: MarkKind;
  segmentId: string;
  createdAt: string;
  label: string;
  note?: string;
  color?: HighlightColor;
}

export interface TranscriptChapter {
  id: string;
  index: number;
  title: string;
  summary: string;
  start: number;
  end: number;
  segmentIds: string[];
}

export interface TranscriptTurn {
  id: string;
  index: number;
  start: number;
  end: number;
  segmentIds: string[];
  wordCount: number;
  characterCount: number;
  speakerLabel?: string;
  attribution: TurnAttribution;
}

export interface SummaryItem {
  id: string;
  text: string;
  reference: TranscriptReference;
  score: number;
}

export interface ActionItem {
  id: string;
  text: string;
  owner?: string;
  dueLabel?: string;
  normalizedDate?: string;
  reference: TranscriptReference;
}

export interface QuestionItem {
  id: string;
  text: string;
  reference: TranscriptReference;
}

export interface DateItem {
  id: string;
  label: string;
  normalizedDate?: string;
  reference: TranscriptReference;
}

export interface ExtractedEntity {
  id: string;
  label: string;
  normalized: string;
  kind: EntityKind;
  count: number;
  references: TranscriptReference[];
}

export interface GlossaryEntry {
  id: string;
  term: string;
  count: number;
  references: TranscriptReference[];
}

export interface KeyMoment {
  id: string;
  title: string;
  reason: string;
  importance: number;
  reference: TranscriptReference;
}

export interface ReviewCue {
  id: string;
  label: string;
  reason: string;
  severity: ReviewSeverity;
  reference: TranscriptReference;
}

export interface TranscriptInsights {
  summary: SummaryItem[];
  actions: ActionItem[];
  questions: QuestionItem[];
  dates: DateItem[];
  entities: ExtractedEntity[];
  glossary: GlossaryEntry[];
  keyMoments: KeyMoment[];
  reviewCues: ReviewCue[];
}

export interface TranscriptStats {
  duration: number;
  wordCount: number;
  characterCount: number;
  segmentCount: number;
  turnCount: number;
  questionCount: number;
  actionCount: number;
  reviewCount: number;
  bookmarkCount: number;
  highlightCount: number;
  speakingRateWpm: number;
}

export interface ProjectSearchEntry {
  segmentId: string;
  start: number;
  end: number;
  text: string;
  normalizedText: string;
  tokens: string[];
}

export interface TranscriptDocument {
  plainText: string;
  chunks: TranscriptChunk[];
  segments: TranscriptSegment[];
  turns: TranscriptTurn[];
  chapters: TranscriptChapter[];
  insights: TranscriptInsights;
  stats: TranscriptStats;
  searchEntries: ProjectSearchEntry[];
  generatedAt: string;
}

export interface TranscriptProject {
  id: string;
  title: string;
  sourceName: string;
  sourceType: string;
  sourceSize: number;
  mediaKind: MediaKind;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  progress: number;
  stageLabel: string;
  detail: string;
  error?: string;
  runtime?: Runtime;
  duration?: number;
  fileStoreKey: string;
  transcript?: TranscriptDocument;
  marks: TranscriptMark[];
}

export type LibrarySearchMatchKind = "title" | "segment";

export interface LibrarySearchResult {
  projectId: string;
  projectTitle: string;
  projectUpdatedAt: string;
  score: number;
  matchKind: LibrarySearchMatchKind;
  entry: ProjectSearchEntry;
}

export interface CachedLookup {
  key: string;
  value: unknown;
  createdAt: string;
  expiresAt?: string;
}
