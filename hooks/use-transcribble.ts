"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { buildTranscriptDocument, updateTranscriptSegmentText } from "@/lib/transcribble/analysis";
import {
  cancelLocalHelperJob,
  createLocalHelperJob,
  fetchLocalHelperCapabilities,
  readLocalHelperJob,
  retryLocalHelperJob,
  uploadLocalHelperSourceFile,
} from "@/lib/transcribble/local-helper-client";
import {
  MODEL_LABELS,
  RUNTIME_LABELS,
  type Runtime,
} from "@/lib/transcribble/constants";
import { getExportFilename, serializeProject, type ExportFormat } from "@/lib/transcribble/export";
import {
  computeRmsEnvelope,
  detectPreferredRuntime,
  getInputAcceptValue,
  getLocalInferenceCapabilityIssue,
  humanizePreparationError,
  LocalPreparationRiskError,
  prepareAudioForTranscription,
  validateMediaImport,
  warmMediaRuntime,
} from "@/lib/transcribble/media";
import {
  applyDiscoveredProjectDuration,
  createProjectFromImportedFile,
  createProjectFromRecordedFile,
  recoverPersistedProjects,
  updateProjectTimestamp,
} from "@/lib/transcribble/projects";
import {
  buildSavedRangeLabel,
  getSegmentsForRange,
  normalizeRangeBounds,
} from "@/lib/transcribble/ranges";
import { searchProjectEntries, searchProjectLibrary } from "@/lib/transcribble/search";
import {
  buildLiveTranscriptText,
  buildRecordingFileName,
  chooseRecordingMimeType,
  INITIAL_RECORDING_VIEW_STATE,
  LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE,
  mergeLiveTranscriptParts,
  resampleRecordingEnvelope,
  type LiveTranscriptPart,
  type RecordingViewState,
} from "@/lib/transcribble/recording";
import {
  buildLocalHelperRequiredDetail,
  projectNeedsHelperReconnect,
  syncLocalHelperJobIntoProject,
} from "@/lib/transcribble/local-helper-state";
import { applyProjectStep } from "@/lib/transcribble/status";
import {
  readBrowserStorageState,
  requestPersistentStorage,
  type BrowserStorageState,
} from "@/lib/transcribble/storage";
import {
  buildReadableTranscript,
  clampTime,
  formatBytes,
  formatDuration,
} from "@/lib/transcribble/transcript";
import {
  chooseTranscriptionBackend,
  getBackendLabel,
} from "@/lib/transcribble/transcription-routing";
import type {
  HelperModelProfile,
  HighlightColor,
  LibrarySearchResult,
  LocalHelperCapabilities,
  LocalHelperJob,
  SavedRange,
  TranscriptChunk,
  TranscriptDocument,
  TranscriptMark,
  TranscriptProject,
  TranscriptSegment,
} from "@/lib/transcribble/types";
import {
  deleteProject as deleteProjectRecord,
  getProjectFile,
  listProjects,
  putProject,
  putProjectWithFile,
  putProjects,
} from "@/lib/transcribble/workspace-db";

interface WorkerProgressItem {
  file: string;
  progress: number;
  total?: number;
  loaded?: number;
}

interface WorkerMessage {
  status:
    | "loading"
    | "initiate"
    | "progress"
    | "done"
    | "ready"
    | "runtime-fallback"
    | "partial"
    | "complete"
    | "error";
  jobId: number;
  device: Runtime;
  data?: string;
  file?: string;
  progress?: number;
  total?: number;
  loaded?: number;
  result?: {
    text: string;
    chunks?: TranscriptChunk[];
  };
}

interface ActiveJob {
  jobId: number;
  projectId: string;
  duration: number;
  envelope?: number[];
}

interface WorkspaceNotice {
  tone: "info" | "error";
  message: string;
}

interface PersistedUiState {
  selectedProjectId?: string | null;
}

interface PersistedAssetState {
  modelReady: boolean;
  mediaReady: boolean;
  modelPrimedAt?: string;
  mediaPrimedAt?: string;
  lastModelRuntime?: Runtime;
}

interface AssetSetupState extends PersistedAssetState {
  warmingModel: boolean;
  warmingMedia: boolean;
  online: boolean;
  lastError?: string;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

interface InstallState {
  shellReady: boolean;
  installPromptAvailable: boolean;
  installed: boolean;
}

interface SetupJob {
  jobId: number;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface HelperPreferences {
  modelProfile: HelperModelProfile;
  phraseHints: string;
  enableAlignment: boolean;
  enableDiarization: boolean;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error?: string;
  readonly message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

type AudioContextConstructor = typeof AudioContext;
type WindowWithAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

interface RecordingController {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAt: number;
  mimeType: string;
  audioContext?: AudioContext;
  analyser?: AnalyserNode;
  analyserData?: Uint8Array<ArrayBuffer>;
  waveformFrameId?: number;
  lastWaveformSampleAt: number;
  lastWaveformStateAt: number;
  envelopeSamples: number[];
  usingWaveformFallback: boolean;
  recognition?: SpeechRecognitionLike;
  recognitionStopExpected: boolean;
  recognitionRestartTimerId?: number;
  recognitionRestartCount: number;
  pendingSave?: PendingRecordedFile;
}

interface PendingRecordedFile {
  file: File;
  startedAt: number;
  stoppedAt: number;
  durationSeconds: number;
  envelope: number[];
  liveTranscriptText: string;
}

const UI_STATE_KEY = "transcribble-ui-state-v2";
const ASSET_STATE_KEY = "transcribble-asset-state-v1";
const HELPER_PREFERENCES_KEY = "transcribble-helper-preferences-v1";

const DEFAULT_ASSET_STATE: PersistedAssetState = {
  modelReady: false,
  mediaReady: false,
};

const DEFAULT_HELPER_PREFERENCES: HelperPreferences = {
  modelProfile: "fast",
  phraseHints: "",
  enableAlignment: false,
  enableDiarization: false,
};

function readStoredJson<T>(key: string) {
  if (typeof window === "undefined") {
    return null as T | null;
  }

  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in restrictive browser contexts.
  }
}

function sortProjects(projects: TranscriptProject[]) {
  return [...projects].sort((left, right) => {
    const pinnedDelta = Number(right.pinned ?? false) - Number(left.pinned ?? false);
    if (pinnedDelta !== 0) return pinnedDelta;
    const leftOrder = left.sortOrder;
    const rightOrder = right.sortOrder;
    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

function makeMarkLabel(segment: TranscriptSegment, kind: TranscriptMark["kind"]) {
  const prefix = kind === "bookmark" ? "Saved moment" : "Highlight";
  return `${prefix} · ${segment.text.slice(0, 48).trim()}${segment.text.length > 48 ? "…" : ""}`;
}

function toProjectFailureSummary(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("could not be found in local storage")) {
    return "Transcribble could not reopen the saved recording in this browser. The session is still listed here, but it needs the original file to continue.";
  }

  if (lower.includes("out of memory") || lower.includes("memory")) {
    return "This recording was too large for the browser memory that was available. The recording is still saved on this device, and it should be retried with the local accelerator.";
  }

  return `${message} The recording is still saved on this device, and you can try again when you're ready.`;
}

function normalizePhraseHints(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isLocalHelperConnectionFailure(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("local helper") ||
    lower.includes("localhost") ||
    lower.includes("connection refused") ||
    lower.includes("could not upload the recording to the local helper")
  );
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as WindowWithSpeechRecognition;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function getAudioContextConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const audioWindow = window as WindowWithAudioContext;
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function isPermissionDeniedError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError" || error.name === "PermissionDeniedError")
  );
}

function getRecordingStartErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError" || error.name === "PermissionDeniedError") {
      return "Microphone access was blocked. Enable it in the browser settings and try again.";
    }

    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect a microphone and try again.";
    }

    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The microphone is already in use or could not be read by this browser.";
    }
  }

  return "Could not start recording. Check microphone access and try again.";
}

async function requestMicrophoneStream() {
  const mediaDevices = navigator.mediaDevices;
  const preferredConstraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };

  try {
    return await mediaDevices.getUserMedia(preferredConstraints);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      throw error;
    }

    return mediaDevices.getUserMedia({ audio: true });
  }
}

function createProvisionalTranscript(
  projectId: string,
  liveTranscriptText: string,
  durationSeconds: number,
  envelope: number[],
) {
  const text = liveTranscriptText.trim();
  if (!text) {
    return undefined;
  }

  const document = buildTranscriptDocument(
    projectId,
    {
      text,
    },
    durationSeconds,
  );

  return envelope.length > 0 ? { ...document, envelope } : document;
}

export function useTranscribble() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const transcriptSearchRef = useRef<HTMLInputElement | null>(null);
  const librarySearchRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerListenerRef = useRef<(event: MessageEvent<WorkerMessage>) => void>(() => undefined);
  const bookmarkShortcutRef = useRef<() => void>(() => undefined);
  const jobCounterRef = useRef(0);
  const activeJobRef = useRef<ActiveJob | null>(null);
  const setupJobRef = useRef<SetupJob | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);
  const projectsRef = useRef<TranscriptProject[]>([]);
  const selectedProjectIdRef = useRef<string | null>(null);
  const helperInFlightRef = useRef<Set<string>>(new Set());
  const helperUrlRef = useRef<string | null>(null);
  const recordingControllerRef = useRef<RecordingController | null>(null);
  const recordingStateRef = useRef<RecordingViewState>(INITIAL_RECORDING_VIEW_STATE);
  const pendingRecordedFileRef = useRef<PendingRecordedFile | null>(null);
  const liveTranscriptRef = useRef({ finalText: "", interimText: "" });

  const [projects, setProjects] = useState<TranscriptProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [runtime, setRuntime] = useState<Runtime>("wasm");
  const [capabilityIssue, setCapabilityIssue] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<WorkspaceNotice | null>(null);
  const [copied, setCopied] = useState(false);
  const [assetProgressItems, setAssetProgressItems] = useState<WorkerProgressItem[]>([]);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [assetSetup, setAssetSetup] = useState<AssetSetupState>(() => ({
    ...DEFAULT_ASSET_STATE,
    ...(readStoredJson<PersistedAssetState>(ASSET_STATE_KEY) ?? DEFAULT_ASSET_STATE),
    warmingModel: false,
    warmingMedia: false,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
  }));
  const [storageState, setStorageState] = useState<BrowserStorageState | null>(null);
  const [helperCapabilities, setHelperCapabilities] = useState<LocalHelperCapabilities | null>(null);
  const [helperPreferences, setHelperPreferences] = useState<HelperPreferences>(
    () => readStoredJson<HelperPreferences>(HELPER_PREFERENCES_KEY) ?? DEFAULT_HELPER_PREFERENCES,
  );
  const [recordingState, setRecordingState] = useState<RecordingViewState>(() => ({
    ...INITIAL_RECORDING_VIEW_STATE,
    liveSpeechRecognitionSupported: Boolean(getSpeechRecognitionConstructor()),
    notice: getSpeechRecognitionConstructor() ? null : LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE,
  }));
  const [installState, setInstallState] = useState<InstallState>({
    shellReady: false,
    installPromptAvailable: false,
    installed: false,
  });
  const installPromptRef = useRef<InstallPromptEvent | null>(null);

  projectsRef.current = projects;
  selectedProjectIdRef.current = selectedProjectId;
  recordingStateRef.current = recordingState;
  const deferredLibraryQuery = useDeferredValue(libraryQuery);
  const deferredTranscriptQuery = useDeferredValue(transcriptQuery);

  const persistProjectSelection = useCallback((projectId: string | null) => {
    writeStoredJson(UI_STATE_KEY, { selectedProjectId: projectId } satisfies PersistedUiState);
  }, []);

  const refreshStorageState = useCallback(async () => {
    const nextState = await readBrowserStorageState();
    setStorageState(nextState);
    return nextState;
  }, []);

  const refreshHelperCapabilities = useCallback(async () => {
    const nextCapabilities = await fetchLocalHelperCapabilities();
    helperUrlRef.current = nextCapabilities.available ? nextCapabilities.url : null;
    setHelperCapabilities(nextCapabilities);
    return nextCapabilities;
  }, []);

  const applyProjectUpdate = useCallback(
    (
      projectId: string,
      updater: (project: TranscriptProject) => TranscriptProject,
      options: {
        persist?: boolean;
        select?: boolean;
      } = {},
    ) => {
      const currentProjects = projectsRef.current;
      let nextProject: TranscriptProject | null = null;
      const nextProjects = currentProjects.map((project) => {
        if (project.id !== projectId) {
          return project;
        }

        nextProject = updateProjectTimestamp(updater(project));
        return nextProject;
      });

      if (!nextProject) {
        return;
      }

      const sortedProjects = sortProjects(nextProjects);
      projectsRef.current = sortedProjects;
      setProjects(sortedProjects);

      if (options.select) {
        setSelectedProjectId(projectId);
        persistProjectSelection(projectId);
      }

      if (options.persist) {
        void putProject(nextProject);
      }
    },
    [persistProjectSelection],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const activeDocument = selectedProject?.transcript ?? null;
  const transcriptSegments = useMemo(
    () => activeDocument?.segments ?? [],
    [activeDocument],
  );
  const transcriptTurns = useMemo(
    () => activeDocument?.turns ?? [],
    [activeDocument],
  );

  const playbackSegmentId = useMemo(() => {
    if (!activeDocument || currentTime <= 0) {
      return null;
    }

    return (
      activeDocument.segments.find(
        (segment) => currentTime >= segment.start && currentTime <= segment.end + 0.35,
      )?.id ?? null
    );
  }, [activeDocument, currentTime]);

  const focusedSegmentId = activeSegmentId ?? playbackSegmentId ?? activeDocument?.segments[0]?.id ?? null;
  const focusedSegment = useMemo(
    () => transcriptSegments.find((segment) => segment.id === focusedSegmentId) ?? null,
    [focusedSegmentId, transcriptSegments],
  );

  const transcriptSearchResults = useMemo(
    () =>
      activeDocument ? searchProjectEntries(activeDocument.searchEntries, deferredTranscriptQuery) : [],
    [activeDocument, deferredTranscriptQuery],
  );

  const librarySearchResults = useMemo(
    () => searchProjectLibrary(projects, deferredLibraryQuery),
    [deferredLibraryQuery, projects],
  );

  const queuedProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.status === "queued" &&
          project.backend !== "local-helper",
      ),
    [projects],
  );

  const projectGroups = useMemo(
    () => ({
      ready: projects.filter((project) => project.status === "ready"),
      active: projects.filter((project) =>
        project.status === "pending-upload" ||
        project.status === "uploading" ||
        project.status === "queued" ||
        project.status === "preparing" ||
        project.status === "loading-model" ||
        project.status === "extracting-audio" ||
        project.status === "chunking" ||
        project.status === "merging" ||
        project.status === "transcribing",
      ),
      errored: projects.filter((project) => project.status === "error" || project.status === "canceled"),
    }),
    [projects],
  );

  const currentProjectMarks = useMemo(
    () => selectedProject?.marks ?? [],
    [selectedProject],
  );
  const currentProjectRanges = useMemo(
    () => (selectedProject?.savedRanges ?? []).toSorted((left, right) => left.start - right.start),
    [selectedProject],
  );
  const selectedFileStoreKey = selectedProject?.fileStoreKey ?? null;

  const persistProjectDuration = useCallback(
    (projectId: string, duration: number) => {
      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }

      const currentProject = projectsRef.current.find((project) => project.id === projectId);
      if (
        !currentProject ||
        (typeof currentProject.duration === "number" &&
          Math.abs(currentProject.duration - duration) < 0.25)
      ) {
        return;
      }

      applyProjectUpdate(
        projectId,
        (project) => applyDiscoveredProjectDuration(project, duration),
        { persist: true },
      );
    },
    [applyProjectUpdate],
  );

  const isBusy =
    selectedProject?.status === "pending-upload" ||
    selectedProject?.status === "uploading" ||
    selectedProject?.status === "preparing" ||
    selectedProject?.status === "loading-model" ||
    selectedProject?.status === "extracting-audio" ||
    selectedProject?.status === "chunking" ||
    selectedProject?.status === "merging" ||
    selectedProject?.status === "transcribing" ||
    queuedProjects.length > 0;

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      const worker = new Worker(new URL("../workers/transcriber.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.addEventListener("message", (event) => workerListenerRef.current(event));
      workerRef.current = worker;
    }

    return workerRef.current;
  }, []);

  const markModelPrimed = useCallback((device: Runtime) => {
    setAssetSetup((previous) => ({
      ...previous,
      modelReady: true,
      warmingModel: false,
      lastModelRuntime: device,
      modelPrimedAt: new Date().toISOString(),
      lastError: undefined,
    }));
  }, []);

  const markMediaPrimed = useCallback(() => {
    setAssetSetup((previous) => ({
      ...previous,
      mediaReady: true,
      warmingMedia: false,
      mediaPrimedAt: new Date().toISOString(),
      lastError: undefined,
    }));
  }, []);

  const rejectSetupJob = useCallback((message: string) => {
    const setupJob = setupJobRef.current;
    if (!setupJob) {
      return;
    }

    setupJob.reject(new Error(message));
    setupJobRef.current = null;
  }, []);

  const resolveSetupJob = useCallback(() => {
    const setupJob = setupJobRef.current;
    if (!setupJob) {
      return;
    }

    setupJob.resolve();
    setupJobRef.current = null;
  }, []);

  const finishJob = useCallback(() => {
    activeJobRef.current = null;
    setAssetProgressItems([]);
    setPartialTranscript("");
  }, []);

  const abortActiveJob = useCallback((projectId: string) => {
    if (activeJobRef.current?.projectId !== projectId) {
      return false;
    }

    activeJobRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    setAssetProgressItems([]);
    setPartialTranscript("");
    return true;
  }, []);

  const finishProjectWithError = useCallback(
    (projectId: string, message: string) => {
      const failureSummary = toProjectFailureSummary(message);

      applyProjectUpdate(
        projectId,
        (project) =>
          applyProjectStep(project, {
            status: "error",
            step: "error",
            progress: 0,
            detail: failureSummary,
            error: message,
          }),
        { persist: true },
      );
      setNotice({
        tone: "error",
        message: failureSummary,
      });
      finishJob();
    },
    [applyProjectUpdate, finishJob],
  );

  const markProjectNeedsLocalHelper = useCallback(
    (projectId: string, message: string) => {
      applyProjectUpdate(
        projectId,
        (project) =>
          applyProjectStep(
            {
              ...project,
              backend: "local-helper",
              transcriptionRoute: "local-helper",
            },
            {
              status: "paused",
              step: "needs-local-helper",
              progress: 0,
              detail: message,
              error: undefined,
            },
          ),
        { persist: true, select: true },
      );
      setNotice({
        tone: "error",
        message,
      });
      finishJob();
    },
    [applyProjectUpdate, finishJob],
  );

  const syncHelperJobIntoProject = useCallback(
    (
      projectId: string,
      job: LocalHelperJob,
      options: {
        persist?: boolean;
        select?: boolean;
      } = {},
    ) => {
      applyProjectUpdate(projectId, (project) => syncLocalHelperJobIntoProject(project, job), {
        persist: options.persist ?? true,
        select: options.select ?? false,
      });
    },
    [applyProjectUpdate],
  );

  const startHelperTranscriptionForProject = useCallback(
    async (
      projectId: string,
      file?: File,
      options?: {
        reason?: string;
        browserFailure?: boolean;
      },
    ) => {
      if (!helperCapabilities?.available || !helperUrlRef.current) {
        const fallbackMessage = buildLocalHelperRequiredDetail(
          options?.reason ?? helperCapabilities?.reason ?? "Transcribble Helper was not reachable on localhost.",
        );
        markProjectNeedsLocalHelper(projectId, fallbackMessage);
        return;
      }

      if (helperInFlightRef.current.has(projectId)) {
        return;
      }

      helperInFlightRef.current.add(projectId);

      try {
        const project = projectsRef.current.find((item) => item.id === projectId);
        if (!project) {
          return;
        }

        const sourceFile = file ?? (await getProjectFile(project.fileStoreKey));
        if (!sourceFile) {
          finishProjectWithError(projectId, "The source media could not be found in local storage.");
          return;
        }

        applyProjectUpdate(
          projectId,
          (current) =>
            applyProjectStep(
              {
                ...current,
                backend: "local-helper",
                backendJobId: current.backendJobId ?? current.id,
                backendStatus: "pending_upload",
                transcriptionRoute: "local-helper",
              },
              {
                status: "pending-upload",
                step: "pending-upload",
                progress: 0,
                detail:
                  options?.reason ??
                  "Saved on this device. Waiting to send the recording to the local accelerator.",
                error: undefined,
              },
            ),
          { persist: true, select: true },
        );

        const { job } = await createLocalHelperJob(helperUrlRef.current, {
          jobId: project.backendJobId ?? project.id,
          projectId: project.id,
          sourceName: project.sourceName,
          sourceType: project.sourceType,
          sourceSize: project.sourceSize,
          mediaKind: project.mediaKind,
          modelProfile: helperPreferences.modelProfile,
          phraseHints: normalizePhraseHints(helperPreferences.phraseHints),
          enableAlignment: helperPreferences.enableAlignment,
          enableDiarization: helperPreferences.enableDiarization,
        });

        syncHelperJobIntoProject(projectId, job, { persist: true, select: true });

        const uploadResult = await uploadLocalHelperSourceFile(
          helperUrlRef.current,
          job.id,
          sourceFile,
          (progress) => {
            applyProjectUpdate(
              projectId,
              (current) =>
                applyProjectStep(
                  {
                    ...current,
                    backend: "local-helper",
                    backendJobId: job.id,
                    backendStatus: "uploading",
                    transcriptionRoute: "local-helper",
                  },
                  {
                    status: "uploading",
                    step: "uploading",
                    progress: Math.max(4, Math.round(progress * 0.24)),
                    detail: `Sending ${current.sourceName} to the local accelerator.`,
                    error: undefined,
                  },
                ),
              { persist: true },
            );
          },
        );

        syncHelperJobIntoProject(projectId, uploadResult.job, { persist: true, select: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not start the local accelerator for this recording.";

        if (isLocalHelperConnectionFailure(message)) {
          markProjectNeedsLocalHelper(
            projectId,
            buildLocalHelperRequiredDetail(message),
          );
          return;
        }

        applyProjectUpdate(
          projectId,
          (project) =>
            applyProjectStep(
              {
                ...project,
                backend: "local-helper",
                backendJobId: project.backendJobId ?? project.id,
                backendStatus: "failed",
                transcriptionRoute: "local-helper",
              },
              {
                status: "error",
                step: "error",
                progress: 0,
                detail: message,
                error: message,
              },
            ),
          { persist: true, select: true },
        );

        setNotice({
          tone: "error",
          message,
        });
      } finally {
        helperInFlightRef.current.delete(projectId);
      }
    },
    [
      applyProjectUpdate,
      finishProjectWithError,
      helperCapabilities?.available,
      helperCapabilities?.reason,
      helperPreferences.enableAlignment,
      helperPreferences.enableDiarization,
      helperPreferences.modelProfile,
      helperPreferences.phraseHints,
      markProjectNeedsLocalHelper,
      syncHelperJobIntoProject,
    ],
  );

  workerListenerRef.current = (event: MessageEvent<WorkerMessage>) => {
    const payload = event.data;
    const activeJob = activeJobRef.current;
    const setupJob = setupJobRef.current;
    const isActiveJob = activeJob?.jobId === payload.jobId;
    const isSetupJob = setupJob?.jobId === payload.jobId;

    if (!isActiveJob && !isSetupJob) {
      return;
    }

    const projectId = activeJob?.projectId;

    switch (payload.status) {
      case "loading":
        if (isSetupJob) {
          setAssetSetup((previous) => ({
            ...previous,
            warmingModel: true,
            lastModelRuntime: payload.device,
            lastError: undefined,
          }));
        }

        if (projectId) {
          applyProjectUpdate(
            projectId,
            (project) =>
              applyProjectStep(project, {
                status: "loading-model",
                step: "getting-browser-ready",
                progress: Math.max(project.progress, 18),
                detail: payload.data ?? "Downloading the one-time local tools this browser needs.",
                runtime: payload.device,
              }),
          );
        }
        break;

      case "initiate":
        if (payload.file) {
          const file = payload.file;
          setAssetProgressItems((items) => [
            ...items.filter((item) => item.file !== file),
            {
              file,
              progress: payload.progress ?? 0,
              total: payload.total,
              loaded: payload.loaded,
            },
          ]);
        }
        break;

      case "progress":
        if (payload.file) {
          setAssetProgressItems((items) =>
            items.map((item) =>
              item.file === payload.file
                ? {
                    ...item,
                    progress: payload.progress ?? item.progress,
                    total: payload.total ?? item.total,
                    loaded: payload.loaded ?? item.loaded,
                  }
                : item,
            ),
          );
        }

        if (projectId) {
          applyProjectUpdate(projectId, (project) =>
            applyProjectStep(project, {
              status: "loading-model",
              step: "getting-browser-ready",
              progress: Math.max(project.progress, Math.round(((payload.progress ?? 0) / 100) * 32) + 26),
              detail: "Downloading the one-time local tools this browser needs.",
            }),
          );
        }
        break;

      case "done":
        if (payload.file) {
          setAssetProgressItems((items) => items.filter((item) => item.file !== payload.file));
        }

        if (projectId) {
          applyProjectUpdate(projectId, (project) =>
            applyProjectStep(project, {
              status: "loading-model",
              step: "getting-browser-ready",
              progress: Math.max(project.progress, 58),
            }),
          );
        }
        break;

      case "ready":
        markModelPrimed(payload.device);

        if (projectId) {
          applyProjectUpdate(projectId, (project) =>
            applyProjectStep(project, {
              status: "preparing",
              step: "getting-recording-ready",
              progress: Math.max(project.progress, 60),
              detail: "The browser is ready. Finishing the recording setup now.",
              runtime: payload.device,
            }),
          );
        } else {
          setAssetProgressItems([]);
          resolveSetupJob();
        }
        break;

      case "runtime-fallback":
        setRuntime("wasm");
        setAssetSetup((previous) => ({
          ...previous,
          lastModelRuntime: "wasm",
        }));

        if (projectId) {
          applyProjectUpdate(
            projectId,
            (project) =>
              applyProjectStep(project, {
                step: project.step ?? "getting-browser-ready",
                runtime: "wasm",
                detail: payload.data ?? "This browser switched to a slower local mode.",
              }),
            { persist: true },
          );
        }
        break;

      case "partial":
        if (!payload.result || !projectId) {
          return;
        }

        {
          const result = payload.result;
          startTransition(() => {
            setPartialTranscript(buildReadableTranscript(result, projectId));
          });
        }

        applyProjectUpdate(projectId, (project) =>
          applyProjectStep(project, {
            status: "transcribing",
            step: "transcribing",
            progress: Math.max(project.progress, Math.round(((payload.progress ?? 0) / 100) * 34) + 60),
            detail:
              payload.device === "webgpu"
                ? "Listening on this device with browser GPU help."
                : "Listening on this device in a slower local mode.",
            runtime: payload.device,
          }),
        );
        break;

      case "complete":
        if (!payload.result || !projectId || !activeJob) {
          return;
        }

        {
          const currentProject = projectsRef.current.find((project) => project.id === projectId);
          const document = buildTranscriptDocument(
            projectId,
            {
              text: payload.result.text,
              chunks: payload.result.chunks,
            },
            activeJob.duration,
            currentProject?.marks ?? [],
          );

          const documentWithEnvelope = activeJob.envelope
            ? { ...document, envelope: activeJob.envelope }
            : document;

          applyProjectUpdate(
            projectId,
            (project) =>
              applyProjectStep(project, {
                status: "ready",
                step: "ready",
                progress: 100,
                detail: "Saved on this device. You can search, edit, and export it any time.",
                error: undefined,
                duration: activeJob.duration,
                runtime: payload.device,
                transcript: documentWithEnvelope,
              }),
            { persist: true, select: !selectedProjectIdRef.current },
          );
        }

        finishJob();
        break;

      case "error": {
        const isMemoryError = payload.data?.toLowerCase().includes("memory") ?? false;
        const message =
          isMemoryError
            ? "The browser ran out of memory while transcribing. Try a shorter file or use a desktop browser."
            : payload.data ?? "Local transcription failed. Try again with a smaller file or a recent Chrome or Edge build.";

        if (isSetupJob) {
          setAssetSetup((previous) => ({
            ...previous,
            warmingModel: false,
            lastError: message,
          }));
          setAssetProgressItems([]);
          rejectSetupJob(message);
        }

        if (projectId) {
          const currentProject = projectsRef.current.find((project) => project.id === projectId);
          if (currentProject?.backend !== "local-helper") {
            finishJob();
            void startHelperTranscriptionForProject(projectId, undefined, {
              browserFailure: true,
              reason:
                isMemoryError
                  ? "The browser ran out of memory locally, so Transcribble is retrying this recording with the local accelerator."
                  : "The browser could not finish this recording locally, so Transcribble is retrying it with the local accelerator.",
            });
            return;
          }

          finishProjectWithError(projectId, message);
        }
        break;
      }

      default:
        break;
    }
  };

  const processProject = useCallback(
    async (project: TranscriptProject) => {
      if (capabilityIssue) {
        finishProjectWithError(project.id, capabilityIssue);
        return;
      }

      const file = await getProjectFile(project.fileStoreKey);
      if (!file) {
        finishProjectWithError(project.id, "The source media could not be found in local storage.");
        return;
      }

      jobCounterRef.current += 1;
      const jobId = jobCounterRef.current;
      activeJobRef.current = {
        jobId,
        projectId: project.id,
        duration: project.duration ?? 0,
      };
      setAssetProgressItems([]);
      setPartialTranscript("");

      applyProjectUpdate(
        project.id,
        (current) =>
          applyProjectStep(current, {
            status: "preparing",
            step: "getting-recording-ready",
            progress: 8,
            detail: "Reading the file and getting the audio ready on this device.",
            error: undefined,
          }),
        { persist: true },
      );

      const worker = getWorker();
      worker.postMessage({
        type: "preload",
        jobId,
        device: runtime,
      });

      try {
        const prepared = await prepareAudioForTranscription(file, {
          onStatus: (detail) => {
            if (activeJobRef.current?.jobId !== jobId) {
              return;
            }

            applyProjectUpdate(project.id, (current) =>
              applyProjectStep(current, {
                status: "preparing",
                step: "getting-recording-ready",
                progress: Math.max(current.progress, 14),
                detail,
              }),
            );
          },
          onProgress: (progress) => {
            if (activeJobRef.current?.jobId !== jobId || progress === null) {
              return;
            }

            applyProjectUpdate(project.id, (current) => ({
              ...current,
              progress: Math.max(current.progress, Math.round((progress / 100) * 22) + 10),
            }));
          },
        });

        if (activeJobRef.current?.jobId !== jobId) {
          return;
        }

        const envelope = computeRmsEnvelope(prepared.audio, 1024);

        activeJobRef.current = {
          jobId,
          projectId: project.id,
          duration: prepared.duration,
          envelope,
        };

        if (prepared.usedFFmpeg) {
          markMediaPrimed();
        }

        applyProjectUpdate(
          project.id,
          (current) =>
            applyProjectStep(current, {
              status: "transcribing",
              step: "transcribing",
              progress: Math.max(current.progress, 60),
              detail: "Transcribing on this device. Longer recordings can take a while on slower hardware.",
              duration: prepared.duration,
            }),
          { persist: true },
        );

        worker.postMessage(
          {
            type: "transcribe",
            jobId,
            device: runtime,
            audio: prepared.audio,
            duration: prepared.duration,
          },
          [prepared.audio.buffer],
        );
      } catch (error) {
        if (activeJobRef.current?.jobId !== jobId) {
          return;
        }

        const message = humanizePreparationError(error);

        if (error instanceof LocalPreparationRiskError) {
          finishJob();
          await startHelperTranscriptionForProject(project.id, file, {
            reason: error.message,
            browserFailure: true,
          });
          return;
        }

        finishJob();
        await startHelperTranscriptionForProject(project.id, file, {
          reason:
            message.includes("local accelerator")
              ? message
              : "The browser could not finish preparing this recording locally, so Transcribble is retrying it with the local accelerator.",
          browserFailure: true,
        });
      }
    },
    [
      applyProjectUpdate,
      capabilityIssue,
      finishProjectWithError,
      finishJob,
      getWorker,
      markMediaPrimed,
      runtime,
      startHelperTranscriptionForProject,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    setCapabilityIssue(getLocalInferenceCapabilityIssue());
    setAssetSetup((previous) => ({
      ...previous,
      online: typeof navigator === "undefined" ? true : navigator.onLine,
    }));

    detectPreferredRuntime().then((detectedRuntime) => {
      if (!cancelled) {
        setRuntime(detectedRuntime);
      }
    });

    void readBrowserStorageState().then((state) => {
      if (!cancelled) {
        setStorageState(state);
      }
    });

    void refreshHelperCapabilities().then((capabilities) => {
      if (cancelled) {
        return;
      }

      helperUrlRef.current = capabilities.available ? capabilities.url : null;
      setHelperCapabilities(capabilities);
    });

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          if (!cancelled) {
            setInstallState((previous) => ({
              ...previous,
              shellReady: true,
              installed:
                previous.installed ||
                window.matchMedia("(display-mode: standalone)").matches ||
                (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
            }));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setInstallState((previous) => ({
              ...previous,
              shellReady: false,
            }));
          }
        });
    }

    void (async () => {
      const storedProjects = await listProjects();
      if (cancelled) {
        return;
      }

      const recoveredProjects = recoverPersistedProjects(storedProjects);
      setProjects(sortProjects(recoveredProjects));

      if (recoveredProjects.some((project, index) => project !== storedProjects[index])) {
        await putProjects(recoveredProjects);
      }

      const nextSelectedProjectId =
        readStoredJson<PersistedUiState>(UI_STATE_KEY)?.selectedProjectId ?? null;

      setSelectedProjectId(
        recoveredProjects.find((project) => project.id === nextSelectedProjectId)?.id ??
          recoveredProjects[0]?.id ??
          null,
      );
      setWorkspaceReady(true);
    })();

    const syncOnlineState = () => {
      setAssetSetup((previous) => ({
        ...previous,
        online: navigator.onLine,
      }));
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as InstallPromptEvent;
      setInstallState((previous) => ({
        ...previous,
        installPromptAvailable: true,
      }));
    };

    const onInstalled = () => {
      installPromptRef.current = null;
      setInstallState((previous) => ({
        ...previous,
        installed: true,
        installPromptAvailable: false,
      }));
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", syncOnlineState);
      window.addEventListener("offline", syncOnlineState);
      window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.addEventListener("appinstalled", onInstalled);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", syncOnlineState);
        window.removeEventListener("offline", syncOnlineState);
        window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      }
      workerRef.current?.terminate();
      workerRef.current = null;
      setupJobRef.current?.reject(new Error("Worker stopped before setup completed."));
      setupJobRef.current = null;

      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }

      if (mediaUrlRef.current) {
        URL.revokeObjectURL(mediaUrlRef.current);
        mediaUrlRef.current = null;
      }
    };
  }, [refreshHelperCapabilities]);

  useEffect(() => {
    writeStoredJson(ASSET_STATE_KEY, {
      modelReady: assetSetup.modelReady,
      mediaReady: assetSetup.mediaReady,
      modelPrimedAt: assetSetup.modelPrimedAt,
      mediaPrimedAt: assetSetup.mediaPrimedAt,
      lastModelRuntime: assetSetup.lastModelRuntime,
    } satisfies PersistedAssetState);
  }, [
    assetSetup.lastModelRuntime,
    assetSetup.mediaPrimedAt,
    assetSetup.mediaReady,
    assetSetup.modelPrimedAt,
    assetSetup.modelReady,
  ]);

  useEffect(() => {
    writeStoredJson(HELPER_PREFERENCES_KEY, helperPreferences);
  }, [helperPreferences]);

  const activeHelperProjects = useMemo(
    () => projects.filter((project) => projectNeedsHelperReconnect(project)),
    [projects],
  );

  const shouldPollHelperCapabilities = useMemo(
    () =>
      (helperCapabilities?.available ?? false) ||
      projects.some(
        (project) =>
          project.backend === "local-helper" || project.step === "needs-local-helper",
      ),
    [helperCapabilities?.available, projects],
  );

  useEffect(() => {
    if (!workspaceReady || !shouldPollHelperCapabilities) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshHelperCapabilities();
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshHelperCapabilities, shouldPollHelperCapabilities, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady || activeJobRef.current || queuedProjects.length === 0) {
      return;
    }

    const nextProject = queuedProjects[0];
    if (!nextProject) {
      return;
    }

    void processProject(nextProject);
  }, [processProject, queuedProjects, workspaceReady]);

  useEffect(() => {
    if (
      !workspaceReady ||
      activeHelperProjects.length === 0 ||
      !helperCapabilities?.available ||
      !helperUrlRef.current
    ) {
      return;
    }

    let cancelled = false;

    const syncProjects = async () => {
      const helperUrl = helperUrlRef.current;
      if (!helperUrl) {
        return;
      }

      for (const project of activeHelperProjects) {
        if (cancelled) {
          return;
        }

        if (!project.backendJobId) {
          continue;
        }

        if (helperInFlightRef.current.has(project.id)) {
          continue;
        }

        try {
          const { job } = await readLocalHelperJob(helperUrl, project.backendJobId);

          if (cancelled) {
            return;
          }

          syncHelperJobIntoProject(project.id, job, { persist: true });
        } catch {
          if (
            project.status === "pending-upload" ||
            project.status === "uploading" ||
            project.status === "queued"
          ) {
            await startHelperTranscriptionForProject(project.id);
          }
        }
      }
    };

    void syncProjects();
    const intervalId = window.setInterval(() => {
      void syncProjects();
    }, 2_500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeHelperProjects,
    helperCapabilities?.available,
    startHelperTranscriptionForProject,
    syncHelperJobIntoProject,
    workspaceReady,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedFileStoreKey) {
      if (mediaUrlRef.current) {
        URL.revokeObjectURL(mediaUrlRef.current);
        mediaUrlRef.current = null;
      }
      setMediaUrl(null);
      setCurrentTime(0);
      setIsPlaying(false);
      return;
    }

    void (async () => {
      const file = await getProjectFile(selectedFileStoreKey);
      if (cancelled) {
        return;
      }

      if (mediaUrlRef.current) {
        URL.revokeObjectURL(mediaUrlRef.current);
      }

      if (!file) {
        mediaUrlRef.current = null;
        setMediaUrl(null);
        setCurrentTime(0);
        setIsPlaying(false);
        return;
      }

      const url = URL.createObjectURL(file);
      mediaUrlRef.current = url;
      setMediaUrl(url);
      setCurrentTime(0);
      setIsPlaying(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedFileStoreKey]);

  const enqueueFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const nextProjects: TranscriptProject[] = [];
      const nextHelperStarts: Array<{ project: TranscriptProject; file: File; detail: string }> = [];
      const errors: string[] = [];
      let workingStorageState = storageState;
      const latestHelperCapabilities =
        helperCapabilities?.available
          ? helperCapabilities
          : await refreshHelperCapabilities().catch(() => helperCapabilities);

      for (const file of files) {
        const validation = await validateMediaImport(file, workingStorageState);

        if (!validation.ok) {
          errors.push(`${file.name}: ${validation.error ?? "Unsupported media file."}`);
          continue;
        }

        const backendDecision = chooseTranscriptionBackend(file, {
          browserLocalAvailable: capabilityIssue === null,
          helperAvailable: Boolean(latestHelperCapabilities?.available),
          deviceMemoryGb:
            typeof navigator === "undefined"
              ? null
              : (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
          hardwareConcurrency:
            typeof navigator === "undefined" ? null : navigator.hardwareConcurrency ?? null,
        });

        let project = createProjectFromImportedFile(
          file,
          runtime,
          backendDecision.backend,
        );

        if (backendDecision.backend === "local-helper" && backendDecision.requiresHelperInstall) {
          project = applyProjectStep(
            {
              ...project,
              backend: "local-helper",
              transcriptionRoute: "local-helper",
            },
            {
              status: "paused",
              step: "needs-local-helper",
              progress: 0,
              detail: backendDecision.reason,
              error: undefined,
            },
          );
        }

        try {
          await putProjectWithFile(project, file);
          nextProjects.push(project);
          if (backendDecision.backend === "local-helper" && !backendDecision.requiresHelperInstall) {
            nextHelperStarts.push({
              project,
              file,
              detail: backendDecision.reason,
            });
          }
          workingStorageState =
            workingStorageState && validation.requiredStorageBytes
              ? {
                  ...workingStorageState,
                  usage:
                    typeof workingStorageState.usage === "number"
                      ? workingStorageState.usage + validation.requiredStorageBytes
                      : workingStorageState.usage,
                  available:
                    typeof workingStorageState.available === "number"
                      ? Math.max(
                          0,
                          workingStorageState.available - validation.requiredStorageBytes,
                        )
                      : workingStorageState.available,
                }
              : workingStorageState;
        } catch {
          const latestStorageState = await refreshStorageState().catch(() => storageState);

          if (
            validation.requiredStorageBytes &&
            typeof latestStorageState?.available === "number"
          ) {
            errors.push(
              `${file.name}: Not enough local storage for this recording. This file needs about ${formatBytes(
                validation.requiredStorageBytes,
              )}; available local storage is about ${formatBytes(
                latestStorageState.available,
              )}. Free space or choose a smaller file.`,
            );
          } else {
            errors.push(
              `${file.name}: Local storage failed while saving this recording. Check browser storage availability and try again.`,
            );
          }
        }
      }

      if (nextProjects.length > 0) {
        const mergedProjects = sortProjects([...nextProjects, ...projectsRef.current]);
        projectsRef.current = mergedProjects;
        setProjects(mergedProjects);

        if (!selectedProjectId) {
          setSelectedProjectId(nextProjects[0]?.id ?? null);
          persistProjectSelection(nextProjects[0]?.id ?? null);
        }

        void refreshStorageState();
        nextHelperStarts.forEach(({ project, file, detail }) => {
          void startHelperTranscriptionForProject(project.id, file, {
            reason: detail,
          });
        });
      }

      if (errors.length > 0) {
        setNotice({
          tone: "error",
          message: errors.join(" "),
        });
      } else if (nextProjects.length > 0) {
        const browserCount = nextProjects.filter((project) => project.backend === "browser").length;
        const helperCount = nextHelperStarts.length;
        const helperRequiredCount = nextProjects.filter(
          (project) => project.step === "needs-local-helper",
        ).length;
        setNotice({
          tone: "info",
          message:
            helperRequiredCount > 0 && browserCount === 0 && helperCount === 0
              ? helperRequiredCount === 1
                ? `Saved ${nextProjects[0]?.sourceName} locally. It needs the local accelerator before transcription can start.`
                : `Saved ${helperRequiredCount} recordings locally. They need the local accelerator before transcription can start.`
              : helperCount > 0 && browserCount > 0
                ? `Queued ${browserCount} browser job${browserCount === 1 ? "" : "s"} and started ${helperCount} local accelerator job${helperCount === 1 ? "" : "s"}.`
                : helperCount > 0
                  ? helperCount === 1
                    ? `Started the local accelerator for ${nextProjects.find((project) => project.backend === "local-helper")?.sourceName}.`
                    : `Started the local accelerator for ${helperCount} recordings.`
                  : nextProjects.length === 1
                    ? `Queued ${nextProjects[0].sourceName} for browser transcription.`
                    : `Queued ${nextProjects.length} files for browser transcription.`,
        });
      }
    },
    [
      capabilityIssue,
      helperCapabilities,
      persistProjectSelection,
      refreshHelperCapabilities,
      refreshStorageState,
      runtime,
      selectedProjectId,
      startHelperTranscriptionForProject,
      storageState,
    ],
  );

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      void enqueueFiles(files);
      event.target.value = "";
    },
    [enqueueFiles],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(false);
      void enqueueFiles(Array.from(event.dataTransfer.files ?? []));
    },
    [enqueueFiles],
  );

  const stopRecordingResources = useCallback((controller: RecordingController) => {
    if (controller.waveformFrameId !== undefined) {
      window.cancelAnimationFrame(controller.waveformFrameId);
      controller.waveformFrameId = undefined;
    }

    if (controller.recognitionRestartTimerId !== undefined) {
      window.clearTimeout(controller.recognitionRestartTimerId);
      controller.recognitionRestartTimerId = undefined;
    }

    controller.recognitionStopExpected = true;
    if (controller.recognition) {
      controller.recognition.onresult = null;
      controller.recognition.onerror = null;
      controller.recognition.onend = null;
      try {
        controller.recognition.stop();
      } catch {
        try {
          controller.recognition.abort();
        } catch {
          // Recognition can throw if it has already ended.
        }
      }
      controller.recognition = undefined;
    }

    controller.stream.getTracks().forEach((track) => track.stop());
    void controller.audioContext?.close().catch(() => undefined);
  }, []);

  const pushRecordingEnvelopeState = useCallback((controller: RecordingController, elapsedMs: number) => {
    setRecordingState((previous) => ({
      ...previous,
      elapsedMs,
      liveEnvelope: resampleRecordingEnvelope(controller.envelopeSamples, 900),
    }));
  }, []);

  const startWaveformLoop = useCallback(
    (controller: RecordingController) => {
      const tick = (timestamp: number) => {
        if (recordingControllerRef.current !== controller || controller.recorder.state === "inactive") {
          return;
        }

        const shouldSample = timestamp - controller.lastWaveformSampleAt >= 45;
        if (shouldSample) {
          let amplitude = 0;
          if (controller.analyser && controller.analyserData) {
            controller.analyser.getByteTimeDomainData(controller.analyserData);
            let sumSquares = 0;
            for (let index = 0; index < controller.analyserData.length; index += 1) {
              const centered = (controller.analyserData[index] - 128) / 128;
              sumSquares += centered * centered;
            }
            amplitude = Math.min(1, Math.sqrt(sumSquares / controller.analyserData.length) * 4.8);
          } else if (controller.usingWaveformFallback) {
            amplitude = 0.08 + Math.abs(Math.sin(timestamp / 180)) * 0.22;
          }

          controller.envelopeSamples.push(amplitude);
          controller.lastWaveformSampleAt = timestamp;
        }

        if (timestamp - controller.lastWaveformStateAt >= 80) {
          controller.lastWaveformStateAt = timestamp;
          pushRecordingEnvelopeState(controller, Date.now() - controller.startedAt);
        }

        controller.waveformFrameId = window.requestAnimationFrame(tick);
      };

      controller.waveformFrameId = window.requestAnimationFrame(tick);
    },
    [pushRecordingEnvelopeState],
  );

  const setupRecordingAnalyser = useCallback(
    async (controller: RecordingController) => {
      try {
        const AudioContextClass = getAudioContextConstructor();
        if (!AudioContextClass) {
          controller.usingWaveformFallback = true;
          startWaveformLoop(controller);
          return;
        }

        const audioContext = new AudioContextClass();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        const source = audioContext.createMediaStreamSource(controller.stream);
        source.connect(analyser);

        controller.audioContext = audioContext;
        controller.analyser = analyser;
        controller.analyserData = new Uint8Array(analyser.fftSize);

        if (audioContext.state === "suspended") {
          await audioContext.resume().catch(() => undefined);
        }

        startWaveformLoop(controller);
      } catch {
        controller.usingWaveformFallback = true;
        startWaveformLoop(controller);
      }
    },
    [startWaveformLoop],
  );

  const startLiveSpeechRecognition = useCallback((controller: RecordingController) => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setRecordingState((previous) => ({
        ...previous,
        liveSpeechRecognitionSupported: false,
        liveSpeechRecognitionActive: false,
        notice: LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE,
      }));
      return;
    }

    const startRecognition = () => {
      if (recordingControllerRef.current !== controller || controller.recognitionStopExpected) {
        return;
      }

      const recognition = new Recognition();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const parts: LiveTranscriptPart[] = [];
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index] ?? event.results.item(index);
          const alternative = result[0] ?? result.item(0);
          parts.push({
            transcript: alternative?.transcript ?? "",
            isFinal: result.isFinal,
          });
        }

        if (parts.length === 0) {
          return;
        }

        setRecordingState((previous) => {
          const merged = mergeLiveTranscriptParts(previous.liveFinalTranscript, parts);
          liveTranscriptRef.current = {
            finalText: merged.finalText,
            interimText: merged.interimText,
          };
          return {
            ...previous,
            liveFinalTranscript: merged.finalText,
            liveInterimTranscript: merged.interimText,
            liveSpeechRecognitionSupported: true,
            liveSpeechRecognitionActive: true,
            notice:
              previous.notice === LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE
                ? null
                : previous.notice,
          };
        });
        controller.recognitionRestartCount = 0;
      };

      recognition.onerror = (event) => {
        setRecordingState((previous) => ({
          ...previous,
          liveSpeechRecognitionActive: false,
          notice:
            event.error === "not-allowed"
              ? "Live transcript permission was blocked. Recording still continues and will transcribe after you stop."
              : previous.notice,
        }));
      };

      recognition.onend = () => {
        setRecordingState((previous) => ({
          ...previous,
          liveSpeechRecognitionActive: false,
        }));

        if (
          recordingControllerRef.current !== controller ||
          controller.recognitionStopExpected ||
          controller.recorder.state !== "recording"
        ) {
          return;
        }

        if (controller.recognitionRestartCount >= 4) {
          setRecordingState((previous) => ({
            ...previous,
            notice: "Live transcript stopped, but recording continues and will transcribe after you stop.",
          }));
          return;
        }

        controller.recognitionRestartCount += 1;
        controller.recognitionRestartTimerId = window.setTimeout(startRecognition, 500);
      };

      controller.recognition = recognition;
      try {
        recognition.start();
        setRecordingState((previous) => ({
          ...previous,
          liveSpeechRecognitionSupported: true,
          liveSpeechRecognitionActive: true,
        }));
      } catch {
        setRecordingState((previous) => ({
          ...previous,
          liveSpeechRecognitionSupported: true,
          liveSpeechRecognitionActive: false,
          notice: "Live transcript could not start. Recording still continues and will transcribe after you stop.",
        }));
      }
    };

    startRecognition();
  }, []);

  const savePendingRecording = useCallback(async () => {
    const pending = pendingRecordedFileRef.current;
    if (!pending) {
      return null;
    }

    setRecordingState((previous) => ({
      ...previous,
      status: "saving",
      error: null,
      canRetrySave: false,
      notice: previous.notice,
    }));

    const validation = await validateMediaImport(pending.file, storageState);

    if (!validation.ok) {
      throw new Error(validation.error ?? "This recording could not be saved in local storage.");
    }

    const latestHelperCapabilities =
      helperCapabilities?.available
        ? helperCapabilities
        : await refreshHelperCapabilities().catch(() => helperCapabilities);

    const backendDecision = chooseTranscriptionBackend(pending.file, {
      browserLocalAvailable: capabilityIssue === null,
      helperAvailable: Boolean(latestHelperCapabilities?.available),
      deviceMemoryGb:
        typeof navigator === "undefined"
          ? null
          : (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      hardwareConcurrency:
        typeof navigator === "undefined" ? null : navigator.hardwareConcurrency ?? null,
    });

    let project = createProjectFromRecordedFile(
      pending.file,
      runtime,
      backendDecision.backend,
      {
        startedAt: new Date(pending.startedAt),
        duration: pending.durationSeconds,
        envelope: pending.envelope,
      },
    );

    const provisionalTranscript = createProvisionalTranscript(
      project.id,
      pending.liveTranscriptText,
      pending.durationSeconds,
      pending.envelope,
    );

    if (provisionalTranscript) {
      project = {
        ...project,
        transcript: provisionalTranscript,
        detail:
          "Saved on this device with a provisional live transcript. The final transcript will replace it after local transcription finishes.",
      };
    }

    if (backendDecision.backend === "local-helper" && backendDecision.requiresHelperInstall) {
      project = applyProjectStep(
        {
          ...project,
          backend: "local-helper",
          transcriptionRoute: "local-helper",
        },
        {
          status: "paused",
          step: "needs-local-helper",
          progress: 0,
          detail: backendDecision.reason,
          error: undefined,
        },
      );
    }

    await putProjectWithFile(project, pending.file);
    pendingRecordedFileRef.current = null;

    const mergedProjects = sortProjects([project, ...projectsRef.current]);
    projectsRef.current = mergedProjects;
    setProjects(mergedProjects);
    setSelectedProjectId(project.id);
    persistProjectSelection(project.id);
    void refreshStorageState();

    if (backendDecision.backend === "local-helper" && !backendDecision.requiresHelperInstall) {
      void startHelperTranscriptionForProject(project.id, pending.file, {
        reason: backendDecision.reason,
      });
    }

    setRecordingState((previous) => ({
      ...previous,
      status:
        project.status === "ready"
          ? "saved"
          : project.status === "error" || project.status === "paused"
            ? "saved"
            : "transcribing",
      savedProjectId: project.id,
      stoppedAt: new Date(pending.stoppedAt).toISOString(),
      error: null,
      canRetrySave: false,
      notice: previous.notice,
    }));

    setNotice({
      tone: "info",
      message: `"${project.title}" was saved on this device.`,
    });

    return project;
  }, [
    capabilityIssue,
    helperCapabilities,
    persistProjectSelection,
    refreshHelperCapabilities,
    refreshStorageState,
    runtime,
    startHelperTranscriptionForProject,
    storageState,
  ]);

  const stopRecording = useCallback(async () => {
    const controller = recordingControllerRef.current;
    if (!controller) {
      if (pendingRecordedFileRef.current) {
        try {
          await savePendingRecording();
        } catch (error) {
          const message = error instanceof Error ? error.message : "This recording could not be saved.";
          setRecordingState((previous) => ({
            ...previous,
            status: "error",
            error: message,
            canRetrySave: true,
          }));
          setNotice({ tone: "error", message });
        }
      }
      return;
    }

    if (recordingStateRef.current.status === "stopping" || recordingStateRef.current.status === "saving") {
      return;
    }

    recordingControllerRef.current = null;
    setRecordingState((previous) => ({
      ...previous,
      status: "stopping",
      liveSpeechRecognitionActive: false,
      error: null,
    }));

    const stoppedAt = Date.now();

    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          controller.recorder.removeEventListener("stop", onStop);
          controller.recorder.removeEventListener("error", onError);
        };
        const onStop = () => {
          cleanup();
          resolve();
        };
        const onError = (event: Event) => {
          cleanup();
          const error = event instanceof ErrorEvent ? event.error : undefined;
          reject(error instanceof Error ? error : new Error("The recorder stopped with an error."));
        };

        if (controller.recorder.state === "inactive") {
          resolve();
          return;
        }

        controller.recorder.addEventListener("stop", onStop, { once: true });
        controller.recorder.addEventListener("error", onError, { once: true });

        try {
          controller.recorder.requestData();
        } catch {
          // Some browsers throw if data is already being finalized.
        }
        controller.recorder.stop();
      });

      stopRecordingResources(controller);
      pushRecordingEnvelopeState(controller, stoppedAt - controller.startedAt);

      const chunks = controller.chunks.filter((chunk) => chunk.size > 0);
      if (chunks.length === 0) {
        throw new Error("The microphone did not produce any audio data.");
      }

      const mimeType = controller.recorder.mimeType || controller.mimeType || chunks.find((chunk) => chunk.type)?.type || "audio/webm";
      const file = new File(chunks, buildRecordingFileName(new Date(controller.startedAt), mimeType), {
        type: mimeType,
        lastModified: stoppedAt,
      });
      const liveTranscriptText = buildLiveTranscriptText(
        liveTranscriptRef.current.finalText,
        liveTranscriptRef.current.interimText,
      );
      const pending: PendingRecordedFile = {
        file,
        startedAt: controller.startedAt,
        stoppedAt,
        durationSeconds: Math.max(0.1, (stoppedAt - controller.startedAt) / 1000),
        envelope: resampleRecordingEnvelope(controller.envelopeSamples, 1024),
        liveTranscriptText,
      };

      pendingRecordedFileRef.current = pending;
      controller.pendingSave = pending;
      setRecordingState((previous) => ({
        ...previous,
        status: "saving",
        stoppedAt: new Date(stoppedAt).toISOString(),
        elapsedMs: stoppedAt - controller.startedAt,
        mimeType,
        chunkCount: chunks.length,
        liveEnvelope: pending.envelope,
        liveFinalTranscript: liveTranscriptRef.current.finalText,
        liveInterimTranscript: liveTranscriptRef.current.interimText,
      }));

      await savePendingRecording();
    } catch (error) {
      stopRecordingResources(controller);
      const message = error instanceof Error ? error.message : "This recording could not be saved.";
      setRecordingState((previous) => ({
        ...previous,
        status: "error",
        error: message,
        canRetrySave: Boolean(pendingRecordedFileRef.current),
        liveSpeechRecognitionActive: false,
      }));
      setNotice({ tone: "error", message });
    }
  }, [pushRecordingEnvelopeState, savePendingRecording, stopRecordingResources]);

  const startRecording = useCallback(async () => {
    if (recordingControllerRef.current) {
      return;
    }

    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      const message = "Microphone recording needs HTTPS or localhost.";
      setRecordingState((previous) => ({
        ...previous,
        status: "error",
        error: message,
      }));
      setNotice({ tone: "error", message });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const message = "This browser does not expose a microphone API.";
      setRecordingState((previous) => ({
        ...previous,
        status: "error",
        error: message,
      }));
      setNotice({ tone: "error", message });
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      const message = "This browser cannot save microphone recordings because MediaRecorder is unavailable.";
      setRecordingState((previous) => ({
        ...previous,
        status: "error",
        error: message,
      }));
      setNotice({ tone: "error", message });
      return;
    }

    const speechSupported = Boolean(getSpeechRecognitionConstructor());
    pendingRecordedFileRef.current = null;
    liveTranscriptRef.current = { finalText: "", interimText: "" };
    setRecordingState({
      ...INITIAL_RECORDING_VIEW_STATE,
      status: "requesting-permission",
      liveSpeechRecognitionSupported: speechSupported,
      notice: speechSupported ? null : LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE,
    });

    let stream: MediaStream | null = null;

    try {
      stream = await requestMicrophoneStream();
      const preferredMimeType = chooseRecordingMimeType(MediaRecorder);
      const recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
      const startedAt = Date.now();
      const mimeType = recorder.mimeType || preferredMimeType || "audio/webm";
      const controller: RecordingController = {
        recorder,
        stream,
        chunks: [],
        startedAt,
        mimeType,
        lastWaveformSampleAt: 0,
        lastWaveformStateAt: 0,
        envelopeSamples: [],
        usingWaveformFallback: false,
        recognitionStopExpected: false,
        recognitionRestartCount: 0,
      };

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          controller.chunks.push(event.data);
          setRecordingState((previous) => ({
            ...previous,
            chunkCount: controller.chunks.length,
            mimeType: event.data.type || previous.mimeType,
          }));
        }
      });

      recorder.addEventListener("error", () => {
        setRecordingState((previous) => ({
          ...previous,
          status: "error",
          error: "The recorder hit an error. The microphone has been stopped.",
          liveSpeechRecognitionActive: false,
        }));
        void stopRecording();
      });

      recorder.start(1000);
      recordingControllerRef.current = controller;
      setRecordingState((previous) => ({
        ...previous,
        status: "recording",
        startedAt: new Date(startedAt).toISOString(),
        stoppedAt: null,
        elapsedMs: 0,
        mimeType,
        error: null,
        savedProjectId: null,
        canRetrySave: false,
      }));
      void setupRecordingAnalyser(controller);
      startLiveSpeechRecognition(controller);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      const message = getRecordingStartErrorMessage(error);
      setRecordingState((previous) => ({
        ...previous,
        status: "error",
        error: message,
        liveSpeechRecognitionActive: false,
      }));
      setNotice({ tone: "error", message });
    }
  }, [setupRecordingAnalyser, startLiveSpeechRecognition, stopRecording]);

  const toggleRecording = useCallback(async () => {
    if (recordingControllerRef.current || recordingStateRef.current.status === "recording") {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [startRecording, stopRecording]);

  const isRecording =
    recordingState.status === "requesting-permission" ||
    recordingState.status === "recording" ||
    recordingState.status === "stopping";

  useEffect(() => {
    setRecordingState((previous) => {
      const supported = Boolean(getSpeechRecognitionConstructor());
      if (previous.liveSpeechRecognitionSupported === supported) {
        return previous;
      }
      return {
        ...previous,
        liveSpeechRecognitionSupported: supported,
        notice:
          supported || previous.status === "idle"
            ? previous.notice
            : LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE,
      };
    });
  }, []);

  useEffect(() => {
    const savedProjectId = recordingState.savedProjectId;
    if (!savedProjectId || recordingState.status === "saved") {
      return;
    }

    const savedProject = projects.find((project) => project.id === savedProjectId);
    if (savedProject?.status === "ready") {
      setRecordingState((previous) => ({
        ...previous,
        status: "saved",
      }));
    }
  }, [projects, recordingState.savedProjectId, recordingState.status]);

  useEffect(() => {
    return () => {
      const controller = recordingControllerRef.current;
      if (!controller) {
        return;
      }
      recordingControllerRef.current = null;
      stopRecordingResources(controller);
    };
  }, [stopRecordingResources]);

  const onCopyTranscript = useCallback(async () => {
    if (!selectedProject?.transcript?.plainText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedProject.transcript.plainText);
      setCopied(true);

      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }

      copiedTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 1500);
    } catch {
      setNotice({
        tone: "error",
        message: "Clipboard access failed. Copy from the transcript panel directly.",
      });
    }
  }, [selectedProject]);

  const onDownloadTranscript = useCallback(
    (format: ExportFormat) => {
      if (!selectedProject?.transcript) {
        return;
      }

      const contents = serializeProject(selectedProject, format);
      const blob = new Blob([contents], {
        type:
          format === "txt"
            ? "text/plain;charset=utf-8"
            : format === "md"
              ? "text/markdown;charset=utf-8"
              : "text/vtt;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getExportFilename(selectedProject, format);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    [selectedProject],
  );

  const selectProject = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      persistProjectSelection(projectId);
      setActiveSegmentId(null);
      setTranscriptQuery("");
      setPartialTranscript("");
      setNotice(null);
    },
    [persistProjectSelection],
  );

  const clearProjectSelection = useCallback(() => {
    setSelectedProjectId(null);
    persistProjectSelection(null);
    setActiveSegmentId(null);
    setTranscriptQuery("");
    setPartialTranscript("");
    setNotice(null);
  }, [persistProjectSelection]);

  const activeDuration = selectedProject?.transcript?.stats.duration ?? selectedProject?.duration;

  const seekToTime = useCallback(
    (time: number, autoplay = false) => {
      const nextTime = clampTime(time, activeDuration);
      pendingSeekRef.current = nextTime;

      if (mediaRef.current) {
        mediaRef.current.currentTime = nextTime;
        setCurrentTime(nextTime);

        if (autoplay) {
          void mediaRef.current.play();
        }
      }
    },
    [activeDuration],
  );

  const selectSegment = useCallback(
    (segmentId: string, autoplay = false) => {
      const segment = transcriptSegments.find((item) => item.id === segmentId);
      if (!segment) {
        return;
      }

      setActiveSegmentId(segmentId);
      seekToTime(segment.start, autoplay);
    },
    [seekToTime, transcriptSegments],
  );

  const selectAdjacentSegment = useCallback(
    (direction: -1 | 1, autoplay = false) => {
      const currentIndex = transcriptSegments.findIndex((segment) => segment.id === focusedSegmentId);
      const targetIndex =
        currentIndex === -1 ? (direction > 0 ? 0 : transcriptSegments.length - 1) : currentIndex + direction;
      const nextSegment = transcriptSegments[Math.max(0, Math.min(transcriptSegments.length - 1, targetIndex))];

      if (!nextSegment) {
        return;
      }

      selectSegment(nextSegment.id, autoplay);
    },
    [focusedSegmentId, selectSegment, transcriptSegments],
  );

  const seekByDelta = useCallback(
    (deltaSeconds: number) => {
      seekToTime(currentTime + deltaSeconds);
    },
    [currentTime, seekToTime],
  );

  const jumpToTranscriptMatch = useCallback(
    (direction: -1 | 1) => {
      if (transcriptSearchResults.length === 0) {
        return;
      }

      const currentIndex = transcriptSearchResults.findIndex(
        (result) => result.entry.segmentId === focusedSegmentId,
      );

      const nextIndex =
        currentIndex === -1
          ? direction > 0
            ? 0
            : transcriptSearchResults.length - 1
          : (currentIndex + direction + transcriptSearchResults.length) % transcriptSearchResults.length;

      const nextMatch = transcriptSearchResults[nextIndex];
      if (!nextMatch) {
        return;
      }

      selectSegment(nextMatch.entry.segmentId);
    },
    [focusedSegmentId, selectSegment, transcriptSearchResults],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("transcribble:command-palette"));
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        transcriptSearchRef.current?.focus();
        transcriptSearchRef.current?.select();
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (mediaRef.current) {
          if (mediaRef.current.paused) {
            void mediaRef.current.play();
          } else {
            mediaRef.current.pause();
          }
        }
        return;
      }

      if (event.key.toLowerCase() === "b" && focusedSegmentId) {
        event.preventDefault();
        bookmarkShortcutRef.current();
        return;
      }

      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        selectAdjacentSegment(1);
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        selectAdjacentSegment(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedSegmentId, selectAdjacentSegment]);

  const updateSelectedSegmentText = useCallback(
    (nextText: string) => {
      if (!selectedProject || !selectedProject.transcript || !focusedSegment) {
        return;
      }

      const nextMarks = selectedProject.marks.map((mark) =>
        mark.segmentId === focusedSegment.id
          ? {
              ...mark,
              label: makeMarkLabel(
                {
                  ...focusedSegment,
                  text: nextText.trim() || focusedSegment.text,
                },
                mark.kind,
              ),
            }
          : mark,
      );

      const nextDocument = updateTranscriptSegmentText(
        selectedProject.id,
        selectedProject.transcript,
        focusedSegment.id,
        nextText,
        nextMarks,
      );

      applyProjectUpdate(
        selectedProject.id,
        (project) => ({
          ...project,
          marks: nextMarks,
          transcript: nextDocument,
          detail: "Saved on this device after your edit.",
        }),
        { persist: true },
      );
    },
    [applyProjectUpdate, focusedSegment, selectedProject],
  );

  const renameSelectedProject = useCallback(
    (nextTitle: string) => {
      if (!selectedProject) {
        return;
      }

      const trimmed = nextTitle.trim();
      if (!trimmed) {
        return;
      }

      applyProjectUpdate(
        selectedProject.id,
        (project) => ({
          ...project,
          title: trimmed,
          detail: "Saved on this device.",
        }),
        { persist: true },
      );
    },
    [applyProjectUpdate, selectedProject],
  );

  const renameProject = useCallback(
    (projectId: string, nextTitle: string) => {
      const trimmed = nextTitle.trim();
      if (!trimmed) return;
      applyProjectUpdate(
        projectId,
        (project) => ({ ...project, title: trimmed }),
        { persist: true },
      );
    },
    [applyProjectUpdate],
  );

  const togglePinProject = useCallback(
    (projectId: string) => {
      applyProjectUpdate(
        projectId,
        (project) => ({ ...project, pinned: !project.pinned }),
        { persist: true },
      );
    },
    [applyProjectUpdate],
  );

  const reorderProjects = useCallback(
    (sourceId: string, targetId: string, position: "before" | "after") => {
      if (sourceId === targetId) return;
      setProjects((previous) => {
        const source = previous.find((project) => project.id === sourceId);
        const target = previous.find((project) => project.id === targetId);
        if (!source || !target) return previous;
        const withoutSource = previous.filter((project) => project.id !== sourceId);
        const targetIndex = withoutSource.findIndex((project) => project.id === targetId);
        if (targetIndex === -1) return previous;
        const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
        const reordered = [
          ...withoutSource.slice(0, insertIndex),
          { ...source, pinned: target.pinned },
          ...withoutSource.slice(insertIndex),
        ];
        const next = reordered.map((project, index) => ({ ...project, sortOrder: index }));
        void putProjects(next);
        return next;
      });
    },
    [],
  );

  const revertSegmentText = useCallback(
    (segmentId: string) => {
      if (!selectedProject || !selectedProject.transcript) return;
      const segment = selectedProject.transcript.segments.find((s) => s.id === segmentId);
      if (!segment || !segment.originalText) return;
      const nextMarks = selectedProject.marks.map((mark) =>
        mark.segmentId === segment.id
          ? {
              ...mark,
              label: makeMarkLabel(
                { ...segment, text: segment.originalText ?? segment.text },
                mark.kind,
              ),
            }
          : mark,
      );
      const nextDocument = updateTranscriptSegmentText(
        selectedProject.id,
        selectedProject.transcript,
        segment.id,
        segment.originalText,
        nextMarks,
      );
      applyProjectUpdate(
        selectedProject.id,
        (project) => ({
          ...project,
          marks: nextMarks,
          transcript: nextDocument,
          detail: "Restored the original transcription.",
        }),
        { persist: true },
      );
    },
    [applyProjectUpdate, selectedProject],
  );

  const upsertMark = useCallback(
    (
      kind: TranscriptMark["kind"],
      color?: HighlightColor,
      segmentIdOverride?: string,
    ) => {
      if (!selectedProject) {
        return;
      }

      const targetSegment = segmentIdOverride
        ? (selectedProject.transcript?.segments.find(
            (segment) => segment.id === segmentIdOverride,
          ) ?? null)
        : focusedSegment;

      if (!targetSegment) {
        return;
      }

      const existingMark = selectedProject.marks.find(
        (mark) => mark.segmentId === targetSegment.id && mark.kind === kind,
      );

      const nextMarks = existingMark
        ? kind === "highlight" && color && existingMark.color !== color
          ? selectedProject.marks.map((mark) =>
              mark.id === existingMark.id
                ? {
                    ...mark,
                    color,
                    label: makeMarkLabel(targetSegment, kind),
                  }
                : mark,
            )
          : selectedProject.marks.filter((mark) => mark.id !== existingMark.id)
        : [
            ...selectedProject.marks,
            {
              id: crypto.randomUUID(),
              kind,
              segmentId: targetSegment.id,
              createdAt: new Date().toISOString(),
              label: makeMarkLabel(targetSegment, kind),
              color,
            },
          ];

      const nextDocument = selectedProject.transcript
        ? ({
            ...selectedProject.transcript,
            stats: {
              ...selectedProject.transcript.stats,
              bookmarkCount: nextMarks.filter((mark) => mark.kind === "bookmark").length,
              highlightCount: nextMarks.filter((mark) => mark.kind === "highlight").length,
            },
          } satisfies TranscriptDocument)
        : undefined;

      applyProjectUpdate(
        selectedProject.id,
        (project) => ({
          ...project,
          marks: nextMarks,
          transcript: nextDocument,
          detail: "Saved on this device.",
        }),
        { persist: true },
      );
    },
    [applyProjectUpdate, focusedSegment, selectedProject],
  );

  const saveRange = useCallback(
    (range: {
      start: number;
      end: number;
      label?: string;
      note?: string;
    }) => {
      if (!selectedProject || !selectedProject.transcript) {
        return;
      }

      const bounds = normalizeRangeBounds(range.start, range.end);
      const segments = getSegmentsForRange(selectedProject.transcript.segments, bounds.start, bounds.end);

      if (segments.length === 0) {
        setNotice({
          tone: "error",
          message: "Pick a time range that overlaps the transcript before saving it.",
        });
        return;
      }

      const trimmedLabel = range.label?.trim();
      const trimmedNote = range.note?.trim();
      const nextRange: SavedRange = {
        id: crypto.randomUUID(),
        label: trimmedLabel || buildSavedRangeLabel(segments.map((segment) => segment.text).join(" ")),
        createdAt: new Date().toISOString(),
        start: bounds.start,
        end: bounds.end,
        segmentIds: segments.map((segment) => segment.id),
        note: trimmedNote || undefined,
      };

      applyProjectUpdate(
        selectedProject.id,
        (project) => ({
          ...project,
          savedRanges: [...project.savedRanges, nextRange].toSorted((left, right) => left.start - right.start),
          detail: "Saved on this device for later review.",
        }),
        { persist: true },
      );

      setNotice({
        tone: "info",
        message: `"${nextRange.label}" is saved on this device.`,
      });
    },
    [applyProjectUpdate, selectedProject],
  );

  const removeSavedRange = useCallback(
    (rangeId: string) => {
      if (!selectedProject) {
        return;
      }

      const targetRange = selectedProject.savedRanges.find((range) => range.id === rangeId);
      if (!targetRange) {
        return;
      }

      applyProjectUpdate(
        selectedProject.id,
        (project) => ({
          ...project,
          savedRanges: project.savedRanges.filter((range) => range.id !== rangeId),
          detail: "Saved on this device.",
        }),
        { persist: true },
      );

      setNotice({
        tone: "info",
        message: `"${targetRange.label}" was removed from this device.`,
      });
    },
    [applyProjectUpdate, selectedProject],
  );

  bookmarkShortcutRef.current = () => upsertMark("bookmark");

  const retryProject = useCallback(
    async (projectId: string) => {
      const project = projectsRef.current.find((item) => item.id === projectId);
      if (!project) {
        return;
      }

      if (project.backend === "local-helper" && project.backendJobId && helperUrlRef.current) {
        try {
          const { job } = await retryLocalHelperJob(helperUrlRef.current, project.backendJobId);
          syncHelperJobIntoProject(projectId, job, { persist: true, select: true });
        } catch (error) {
          setNotice({
            tone: "error",
            message:
              error instanceof Error
                ? error.message
                : "Could not retry the local accelerator for this recording.",
          });
        }
        return;
      }

      if (project.backend === "local-helper" || project.step === "needs-local-helper") {
        await refreshHelperCapabilities().catch(() => helperCapabilities);
        await startHelperTranscriptionForProject(
          projectId,
          undefined,
          {
            reason: project.detail || buildLocalHelperRequiredDetail(),
          },
        );
        return;
      }

      applyProjectUpdate(
        projectId,
        (project) =>
          applyProjectStep(project, {
            status: "queued",
            step: "queued",
            progress: 0,
            detail: "Saved on this device and queued to try again.",
            error: undefined,
          }),
        { persist: true, select: true },
      );
    },
    [
      applyProjectUpdate,
      helperCapabilities,
      refreshHelperCapabilities,
      startHelperTranscriptionForProject,
      syncHelperJobIntoProject,
    ],
  );

  const removeProject = useCallback(
    async (projectId: string) => {
      const project = projectsRef.current.find((item) => item.id === projectId);
      if (!project) {
        return;
      }

      const shouldRemove =
        typeof window === "undefined"
          ? true
          : window.confirm(
              project.status === "transcribing" || project.status === "preparing" || project.status === "loading-model"
                ? `Remove "${project.title}" from this browser and stop working on it now? This deletes the saved recording and transcript data from this device.`
                : `Remove "${project.title}" from this browser? This deletes the saved recording, transcript, and workspace data from this device.`,
            );

      if (!shouldRemove) {
        return;
      }

      abortActiveJob(projectId);
      if (project.backend === "local-helper" && project.backendJobId && helperUrlRef.current) {
        void cancelLocalHelperJob(helperUrlRef.current, project.backendJobId);
      }

      const nextProjects = projectsRef.current.filter((item) => item.id !== projectId);
      setProjects(sortProjects(nextProjects));

      if (selectedProjectId === projectId) {
        const fallbackProjectId = nextProjects[0]?.id ?? null;
        setSelectedProjectId(fallbackProjectId);
        persistProjectSelection(fallbackProjectId);
      }

      await deleteProjectRecord(project);
      setNotice({
        tone: "info",
        message: `"${project.title}" was removed from this device.`,
      });
    },
    [abortActiveJob, persistProjectSelection, selectedProjectId],
  );

  const openLibrarySearchResult = useCallback(
    (result: LibrarySearchResult) => {
      selectProject(result.projectId);
      if ((result.matchKind === "segment" || result.matchKind === "saved-range") && result.entry.segmentId) {
        setActiveSegmentId(result.entry.segmentId);
        seekToTime(result.entry.start);
      }
    },
    [seekToTime, selectProject],
  );

  const primeTranscriptionModel = useCallback(async () => {
    if (activeJobRef.current || setupJobRef.current || assetSetup.warmingModel || queuedProjects.length > 0) {
      return;
    }

    jobCounterRef.current += 1;
    const jobId = jobCounterRef.current;
    setAssetProgressItems([]);
    setAssetSetup((previous) => ({
      ...previous,
      warmingModel: true,
      lastError: undefined,
    }));

    const ready = new Promise<void>((resolve, reject) => {
      setupJobRef.current = {
        jobId,
        resolve,
        reject,
      };
    });

    getWorker().postMessage({
      type: "preload",
      jobId,
      device: runtime,
    });

    try {
      await ready;
      setNotice({
        tone: "info",
        message: "This browser is ready to transcribe recordings.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "This browser could not finish its one-time transcription setup.";
      setNotice({
        tone: "error",
        message,
      });
    }
  }, [assetSetup.warmingModel, getWorker, queuedProjects.length, runtime]);

  const primeMediaRuntime = useCallback(async () => {
    if (activeJobRef.current || assetSetup.warmingMedia || queuedProjects.length > 0) {
      return;
    }

    setAssetSetup((previous) => ({
      ...previous,
      warmingMedia: true,
      lastError: undefined,
    }));
    setAssetProgressItems([
      {
        file: "ffmpeg-core",
        progress: 0,
      },
    ]);

    try {
      await warmMediaRuntime({
        onProgress: (progress) => {
          setAssetProgressItems([
            {
              file: "ffmpeg-core",
              progress: progress ?? 0,
            },
          ]);
        },
      });

      markMediaPrimed();
      setAssetProgressItems([]);
      setNotice({
        tone: "info",
        message: "Video runtime is ready for local imports and fallback media work.",
      });
    } catch (error) {
      const message = humanizePreparationError(error);
      setAssetSetup((previous) => ({
        ...previous,
        warmingMedia: false,
        lastError: message,
      }));
      setAssetProgressItems([]);
      setNotice({
        tone: "error",
        message,
      });
    }
  }, [assetSetup.warmingMedia, markMediaPrimed, queuedProjects.length]);

  const askForPersistentStorage = useCallback(async () => {
    const granted = await requestPersistentStorage();
    const nextState = await refreshStorageState();

    setNotice({
      tone: granted ? "info" : "error",
      message:
        granted || nextState.persisted
          ? "Browser granted persistent local storage for this workspace."
          : "Browser did not confirm persistent local storage. Your work still stays here, but local files may be cleared under storage pressure.",
    });
  }, [refreshStorageState]);

  const resetSetupState = useCallback(() => {
    setAssetSetup((previous) => ({
      ...previous,
      modelReady: false,
      mediaReady: false,
      modelPrimedAt: undefined,
      mediaPrimedAt: undefined,
      lastError: undefined,
    }));
    setAssetProgressItems([]);
    setNotice({
      tone: "info",
      message: "Saved setup status was reset. Your recordings and projects were left alone.",
    });
  }, []);

  const promptInstall = useCallback(async () => {
    const promptEvent = installPromptRef.current;
    if (!promptEvent) {
      return;
    }

    await promptEvent.prompt();
    const result = await promptEvent.userChoice;

    installPromptRef.current = null;
    setInstallState((previous) => ({
      ...previous,
      installPromptAvailable: false,
      installed: result.outcome === "accepted" ? true : previous.installed,
    }));
  }, []);

  const updateHelperModelProfile = useCallback((modelProfile: HelperModelProfile) => {
    setHelperPreferences((previous) => ({
      ...previous,
      modelProfile,
    }));
  }, []);

  const updateHelperPhraseHints = useCallback((phraseHints: string) => {
    setHelperPreferences((previous) => ({
      ...previous,
      phraseHints,
    }));
  }, []);

  const updateHelperAlignment = useCallback((enableAlignment: boolean) => {
    setHelperPreferences((previous) => ({
      ...previous,
      enableAlignment,
    }));
  }, []);

  const updateHelperDiarization = useCallback((enableDiarization: boolean) => {
    setHelperPreferences((previous) => ({
      ...previous,
      enableDiarization,
    }));
  }, []);

  const currentFileMeta = useMemo(
    () =>
      selectedProject
        ? {
            fileMeta: selectedProject.sourceName,
            durationLabel: selectedProject.transcript
              ? formatDuration(selectedProject.transcript.stats.duration)
              : selectedProject.duration
                ? formatDuration(selectedProject.duration)
                : selectedProject.status === "error"
                  ? "Unavailable"
                  : selectedProject.step === "needs-local-helper"
                    ? "Needs local accelerator"
                  : selectedProject.status === "paused"
                    ? "Paused locally"
                  : selectedProject.status === "queued"
                    ? "Waiting to start"
                    : selectedProject.step === "probing"
                      ? "Checking recording"
                    : selectedProject.step === "getting-browser-ready"
                      ? "Waiting for browser setup"
                      : selectedProject.step === "transcribing"
                        ? "Transcribing"
                        : "Getting ready",
            runtimeLabel:
              selectedProject.backend === "browser" || !selectedProject.backend
                ? selectedProject.runtime
                  ? RUNTIME_LABELS[selectedProject.runtime]
                  : selectedProject.status === "error"
                    ? "Didn't start"
                    : selectedProject.status === "paused"
                      ? "Paused locally"
                      : "Starting browser tools"
                : getBackendLabel(selectedProject.backend),
            modelLabel:
              selectedProject.backend === "browser" || !selectedProject.backend
                ? selectedProject.runtime
                  ? MODEL_LABELS[selectedProject.runtime]
                  : "Whisper base timestamped"
                : selectedProject.transcriptionModelName ??
                  (selectedProject.transcriptionModelProfile === "accurate"
                    ? "large-v3 class local model"
                    : "distil-large-v3 class local model"),
            fileSizeLabel: formatBytes(selectedProject.sourceSize),
          }
        : {
            fileMeta: "No project selected",
            durationLabel: "No recording yet",
            runtimeLabel: getBackendLabel("browser"),
            modelLabel: MODEL_LABELS[runtime],
            fileSizeLabel: "0 B",
          },
    [runtime, selectedProject],
  );

  const mediaHandlers = {
    onLoadedMetadata: () => {
      const media = mediaRef.current;
      const projectId = selectedProjectIdRef.current;

      if (media && projectId) {
        persistProjectDuration(projectId, media.duration);
      }

      if (pendingSeekRef.current !== null && mediaRef.current) {
        mediaRef.current.currentTime = pendingSeekRef.current;
        setCurrentTime(pendingSeekRef.current);
        pendingSeekRef.current = null;
      } else if (media) {
        setCurrentTime(media.currentTime ?? 0);
      }
    },
    onTimeUpdate: () => {
      setCurrentTime(mediaRef.current?.currentTime ?? 0);
    },
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
  };

  // The HTMLMediaElement `timeupdate` event fires at ~4 Hz, which is why
  // the transcript highlight visibly lags the audio. While playing, poll
  // currentTime on every animation frame so the highlight tracks in real time.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      const media = mediaRef.current;
      if (media && !media.paused) {
        setCurrentTime(media.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return {
    inputRef,
    mediaRef,
    transcriptSearchRef,
    librarySearchRef,
    projects,
    projectGroups,
    selectedProject,
    transcriptSegments,
    transcriptTurns,
    partialTranscript,
    mediaUrl,
    currentTime,
    isPlaying,
    currentProjectMarks,
    currentProjectRanges,
    focusedSegment,
    focusedSegmentId,
    playbackSegmentId,
    transcriptSearchResults,
    librarySearchResults,
    libraryQuery,
    transcriptQuery,
    currentFileMeta,
    capabilityIssue,
    runtime,
    assetSetup,
    storageState,
    helperCapabilities,
    helperPreferences,
    installState,
    dragActive,
    copied,
    notice,
    recordingState,
    assetProgressItems,
    queuedProjects,
    isBusy,
    accept: getInputAcceptValue(),
    workspaceReady,
    openFilePicker,
    onFileInputChange,
    onDrop,
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(true);
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(false);
    },
    onCopyTranscript,
    onDownloadTranscript,
    selectProject,
    clearProjectSelection,
    seekToTime,
    seekByDelta,
    selectSegment,
    selectAdjacentSegment,
    jumpToTranscriptMatch,
    renameSelectedProject,
    renameProject,
    togglePinProject,
    reorderProjects,
    revertSegmentText,
    toggleRecording,
    startRecording,
    stopRecording,
    savePendingRecording,
    isRecording,
    updateSelectedSegmentText,
    toggleBookmark: () => upsertMark("bookmark"),
    toggleHighlight: (color: HighlightColor) => upsertMark("highlight", color),
    bookmarkSegment: (segmentId: string) => upsertMark("bookmark", undefined, segmentId),
    saveRange,
    removeSavedRange,
    primeTranscriptionModel,
    primeMediaRuntime,
    askForPersistentStorage,
    refreshStorageState,
    resetSetupState,
    promptInstall,
    refreshHelperCapabilities,
    updateHelperAlignment,
    updateHelperDiarization,
    updateHelperModelProfile,
    updateHelperPhraseHints,
    retryProject,
    removeProject,
    openLibrarySearchResult,
    setLibraryQuery,
    setTranscriptQuery,
    setActiveSegmentId,
    setNotice,
    mediaHandlers,
  };
}
