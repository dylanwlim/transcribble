import type { Runtime } from "@/lib/transcribble/constants";

export type ProjectStatus =
  | "pending-upload"
  | "uploading"
  | "queued"
  | "preparing"
  | "loading-model"
  | "extracting-audio"
  | "chunking"
  | "transcribing"
  | "merging"
  | "paused"
  | "ready"
  | "error"
  | "canceled";

export type ProjectStep =
  | "pending-upload"
  | "uploading"
  | "queued"
  | "needs-local-helper"
  | "getting-local-model"
  | "getting-browser-ready"
  | "getting-recording-ready"
  | "probing"
  | "extracting-audio"
  | "chunking"
  | "transcribing"
  | "merging"
  | "paused"
  | "saving"
  | "ready"
  | "error"
  | "canceled";

export type MediaKind = "audio" | "video";
export type TranscriptionBackend = "browser" | "local-helper";
export type LegacyTranscriptionRoute = "local" | "cloud";
export type TranscriptionRoute = TranscriptionBackend | LegacyTranscriptionRoute;

export type HelperModelProfile = "fast" | "accurate";
export type LocalHelperJobStatus =
  | "pending_upload"
  | "uploading"
  | "queued"
  | "downloading_model"
  | "probing"
  | "extracting_audio"
  | "chunking"
  | "transcribing"
  | "merging"
  | "completed"
  | "failed"
  | "canceled";

export interface LocalHelperModelAvailability {
  profile: HelperModelProfile;
  label: string;
  modelName: string;
  downloaded: boolean;
  diskUsageBytes?: number;
  recommended?: boolean;
}

export interface LocalHelperCapabilities {
  available: boolean;
  url: string;
  protocolVersion?: string;
  version?: string;
  platform?: string;
  backend?: string;
  backendLabel?: string;
  ffmpegReady?: boolean;
  ffprobeReady?: boolean;
  supportsWordTimestamps?: boolean;
  supportsPhraseHints?: boolean;
  supportsAlignment?: boolean;
  supportsDiarization?: boolean;
  maxParallelChunks?: number;
  targetChunkSeconds?: number;
  chunkOverlapSeconds?: number;
  cacheBytes?: number;
  models: LocalHelperModelAvailability[];
  reason?: string;
  nextAction?: string;
}

export interface LocalHelperResumeState {
  totalChunks?: number;
  completedChunks?: number;
  completedChunkIndexes?: number[];
  nextChunkIndex?: number | null;
}

export interface LocalHelperFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface LocalHelperJob {
  id: string;
  projectId: string;
  sourceName: string;
  sourceType: string;
  sourceSize: number;
  mediaKind: MediaKind;
  status: LocalHelperJobStatus;
  progress: number;
  detail: string;
  createdAt: string;
  updatedAt: string;
  protocolVersion?: string;
  durationSec?: number;
  backend?: string;
  backendLabel?: string;
  maxParallelChunks?: number;
  modelProfile: HelperModelProfile;
  modelName?: string;
  modelDownloadBytes?: number;
  totalChunks?: number;
  completedChunks?: number;
  sourceUploaded?: boolean;
  transcript?: TranscriptPayload;
  resume?: LocalHelperResumeState;
  error?: LocalHelperFailure;
  completedAt?: string;
  canceledAt?: string;
}

export type ReviewSeverity = "low" | "medium";

export type MarkKind = "bookmark" | "highlight";

export type HighlightColor = "amber" | "sky" | "rose";

export type EntityKind = "person" | "organization" | "product" | "term";

export type TurnAttribution = "pause-derived" | "manual" | "diarized";

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptChunk {
  text: string;
  timestamp: [number, number | null];
  words?: TranscriptWord[];
  speakerLabel?: string;
  attribution?: TurnAttribution;
}

export interface TranscriptPayload {
  text: string;
  chunks?: TranscriptChunk[];
  language?: string;
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
  speakerLabel?: string;
  attribution?: TurnAttribution;
  originalText?: string;
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

export interface SavedRange {
  id: string;
  label: string;
  createdAt: string;
  start: number;
  end: number;
  segmentIds: string[];
  note?: string;
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
  kind?: "segment" | "saved-range";
  label?: string;
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
  envelope?: number[];
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
  step?: ProjectStep;
  progress: number;
  stageLabel: string;
  detail: string;
  error?: string;
  runtime?: Runtime;
  backend?: TranscriptionBackend;
  backendJobId?: string;
  backendStatus?: string;
  backendProvider?: string;
  backendLastSyncedAt?: string;
  transcriptionModelProfile?: HelperModelProfile;
  transcriptionModelName?: string;
  resumeState?: LocalHelperResumeState;
  transcriptionRoute?: TranscriptionRoute;
  duration?: number;
  envelope?: number[];
  fileStoreKey: string;
  transcript?: TranscriptDocument;
  marks: TranscriptMark[];
  savedRanges: SavedRange[];
  pinned?: boolean;
  sortOrder?: number;
}

export type LibrarySearchMatchKind = "title" | "segment" | "saved-range";

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
