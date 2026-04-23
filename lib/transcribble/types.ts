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
export type TranscriptionBackend = "browser" | "local-helper" | "external";
export type LegacyTranscriptionRoute = "local" | "cloud";
export type TranscriptionRoute = TranscriptionBackend | LegacyTranscriptionRoute;
export type CloudStorageProvider = "local" | "vercel-blob";
export type CloudTranscriptionMode = "standard" | "diarized" | "word-timestamps";
export type CloudTranscriptionJobStatus =
  | "pending_upload"
  | "uploading"
  | "queued"
  | "extracting_audio"
  | "chunking"
  | "transcribing"
  | "merging"
  | "completed"
  | "failed"
  | "canceled";

export interface CloudTranscriptionCapabilities {
  enabled: boolean;
  provider: CloudStorageProvider;
  mode: CloudTranscriptionMode;
  maxUploadBytes: number;
  reason?: string;
}

export type HelperModelProfile = "fast" | "accurate";
export type LocalHelperJobStatus =
  | "pending_upload"
  | "uploading"
  | "queued"
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
  version?: string;
  platform?: string;
  backend?: string;
  backendLabel?: string;
  ffmpegReady?: boolean;
  ffprobeReady?: boolean;
  supportsWordTimestamps?: boolean;
  supportsAlignment?: boolean;
  supportsDiarization?: boolean;
  cacheBytes?: number;
  models: LocalHelperModelAvailability[];
  reason?: string;
}

export interface LocalHelperResumeState {
  totalChunks?: number;
  completedChunks?: number;
  completedChunkIndexes?: number[];
  nextChunkIndex?: number;
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
  durationSec?: number;
  backend?: string;
  backendLabel?: string;
  modelProfile: HelperModelProfile;
  modelName?: string;
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

export interface TranscriptChunk {
  text: string;
  timestamp: [number, number | null];
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

export interface CloudSourceAsset {
  pathname: string;
  provider: CloudStorageProvider;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  url?: string;
}

export interface CloudChunkArtifact {
  chunkIndex: number;
  startMs: number;
  endMs: number;
  primaryStartMs: number;
  primaryEndMs: number;
  overlapMs: number;
  byteSize: number;
  durationSec: number;
  pathname: string;
  provider: CloudStorageProvider;
  createdAt: string;
  url?: string;
}

export interface CloudTranscriptionFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface CloudTranscriptionJob {
  id: string;
  projectId: string;
  sessionId: string;
  sourceName: string;
  sourceType: string;
  sourceSize: number;
  mediaKind: MediaKind;
  provider: CloudStorageProvider;
  mode: CloudTranscriptionMode;
  status: CloudTranscriptionJobStatus;
  progress: number;
  detail: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  durationSec?: number;
  source?: CloudSourceAsset;
  chunks: CloudChunkArtifact[];
  totalChunks?: number;
  completedChunks?: number;
  transcript?: TranscriptPayload;
  transcriptPath?: string;
  workflowRunId?: string;
  error?: CloudTranscriptionFailure;
  completedAt?: string;
  canceledAt?: string;
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
  cloudJobId?: string;
  cloudProvider?: CloudStorageProvider;
  cloudStatus?: CloudTranscriptionJobStatus;
  cloudLastSyncedAt?: string;
  duration?: number;
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
