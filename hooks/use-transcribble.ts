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
  MODEL_LABELS,
  RUNTIME_LABELS,
  type Runtime,
} from "@/lib/transcribble/constants";
import { getExportFilename, serializeProject, type ExportFormat } from "@/lib/transcribble/export";
import {
  detectPreferredRuntime,
  getInputAcceptValue,
  getLocalInferenceCapabilityIssue,
  humanizePreparationError,
  prepareAudioForTranscription,
  validateMediaFile,
  warmMediaRuntime,
} from "@/lib/transcribble/media";
import {
  createProjectFromFile,
  recoverPersistedProjects,
  updateProjectTimestamp,
} from "@/lib/transcribble/projects";
import {
  buildSavedRangeLabel,
  getSegmentsForRange,
  normalizeRangeBounds,
} from "@/lib/transcribble/ranges";
import { searchProjectEntries, searchProjectLibrary } from "@/lib/transcribble/search";
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
import type {
  HighlightColor,
  LibrarySearchResult,
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

const UI_STATE_KEY = "transcribble-ui-state-v2";
const ASSET_STATE_KEY = "transcribble-asset-state-v1";

const DEFAULT_ASSET_STATE: PersistedAssetState = {
  modelReady: false,
  mediaReady: false,
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
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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
  const [installState, setInstallState] = useState<InstallState>({
    shellReady: false,
    installPromptAvailable: false,
    installed: false,
  });
  const installPromptRef = useRef<InstallPromptEvent | null>(null);

  projectsRef.current = projects;
  selectedProjectIdRef.current = selectedProjectId;
  const deferredLibraryQuery = useDeferredValue(libraryQuery);
  const deferredTranscriptQuery = useDeferredValue(transcriptQuery);

  const persistProjectSelection = useCallback((projectId: string | null) => {
    writeStoredJson(UI_STATE_KEY, { selectedProjectId: projectId } satisfies PersistedUiState);
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
      let nextProject: TranscriptProject | null = null;

      setProjects((previous) => {
        const nextProjects = previous.map((project) => {
          if (project.id !== projectId) {
            return project;
          }

          nextProject = updateProjectTimestamp(updater(project));
          return nextProject;
        });

        return sortProjects(nextProjects);
      });

      if (options.select) {
        setSelectedProjectId(projectId);
        persistProjectSelection(projectId);
      }

      if (options.persist && nextProject) {
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
    () => projects.filter((project) => project.status === "queued"),
    [projects],
  );

  const projectGroups = useMemo(
    () => ({
      ready: projects.filter((project) => project.status === "ready"),
      active: projects.filter((project) =>
        project.status === "queued" ||
        project.status === "preparing" ||
        project.status === "loading-model" ||
        project.status === "transcribing",
      ),
      errored: projects.filter((project) => project.status === "error"),
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

  const isBusy =
    selectedProject?.status === "preparing" ||
    selectedProject?.status === "loading-model" ||
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
      applyProjectUpdate(
        projectId,
        (project) =>
          applyProjectStep(project, {
            status: "error",
            step: "error",
            progress: 0,
            detail: message,
            error: message,
          }),
        { persist: true },
      );
      setNotice({
        tone: "error",
        message,
      });
      finishJob();
    },
    [applyProjectUpdate, finishJob],
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
                detail: payload.data ?? "This browser fell back to a slower local runtime.",
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
                : "Listening on this device with the browser's slower local runtime.",
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
                transcript: document,
              }),
            { persist: true, select: !selectedProjectIdRef.current },
          );
        }

        finishJob();
        break;

      case "error": {
        const message =
          payload.data?.toLowerCase().includes("memory")
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

        activeJobRef.current = {
          jobId,
          projectId: project.id,
          duration: prepared.duration,
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

        finishProjectWithError(project.id, humanizePreparationError(error));
      }
    },
    [applyProjectUpdate, capabilityIssue, finishProjectWithError, getWorker, markMediaPrimed, runtime],
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
  }, []);

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
      const errors: string[] = [];

      for (const file of files) {
        const validation = validateMediaFile(file);

        if (!validation.ok) {
          errors.push(`${file.name}: ${validation.error ?? "Unsupported media file."}`);
          continue;
        }

        const project = createProjectFromFile(file, runtime);

        try {
          await putProjectWithFile(project, file);
          nextProjects.push(project);
        } catch {
          errors.push(`${file.name}: Local storage failed while saving the project. Check browser storage availability.`);
        }
      }

      if (nextProjects.length > 0) {
        setProjects((previous) => sortProjects([...nextProjects, ...previous]));

        if (!selectedProjectId) {
          setSelectedProjectId(nextProjects[0]?.id ?? null);
          persistProjectSelection(nextProjects[0]?.id ?? null);
        }
      }

      if (errors.length > 0) {
        setNotice({
          tone: "error",
          message: errors.join(" "),
        });
      } else if (nextProjects.length > 0) {
        setNotice({
          tone: "info",
          message:
            nextProjects.length === 1
              ? `Queued ${nextProjects[0].sourceName} for local transcription.`
              : `Queued ${nextProjects.length} files for local transcription.`,
        });
      }
    },
    [persistProjectSelection, runtime, selectedProjectId],
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
        librarySearchRef.current?.focus();
        librarySearchRef.current?.select();
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

  const upsertMark = useCallback(
    (kind: TranscriptMark["kind"], color?: HighlightColor) => {
      if (!selectedProject || !focusedSegment) {
        return;
      }

      const existingMark = selectedProject.marks.find(
        (mark) => mark.segmentId === focusedSegment.id && mark.kind === kind,
      );

      const nextMarks = existingMark
        ? kind === "highlight" && color && existingMark.color !== color
          ? selectedProject.marks.map((mark) =>
              mark.id === existingMark.id
                ? {
                    ...mark,
                    color,
                    label: makeMarkLabel(focusedSegment, kind),
                  }
                : mark,
            )
          : selectedProject.marks.filter((mark) => mark.id !== existingMark.id)
        : [
            ...selectedProject.marks,
            {
              id: crypto.randomUUID(),
              kind,
              segmentId: focusedSegment.id,
              createdAt: new Date().toISOString(),
              label: makeMarkLabel(focusedSegment, kind),
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
    (projectId: string) => {
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
    [applyProjectUpdate],
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
        message: "This browser is ready to transcribe locally.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "This browser could not finish setup for local transcription.";
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
        message: "This browser is ready to open video imports and local fallback media processing.",
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

  const refreshStorageState = useCallback(async () => {
    const nextState = await readBrowserStorageState();
    setStorageState(nextState);
    return nextState;
  }, []);

  const askForPersistentStorage = useCallback(async () => {
    const granted = await requestPersistentStorage();
    const nextState = await refreshStorageState();

    setNotice({
      tone: granted ? "info" : "error",
      message:
        granted || nextState.persisted
          ? "This browser agreed to keep Transcribble's local storage around more reliably."
          : "This browser did not confirm protected storage. Your work still stays local, but large files may be easier for the browser to clear.",
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
      message: "Saved setup status was reset. Your projects were left alone.",
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

  const currentFileMeta = useMemo(
    () =>
      selectedProject
        ? {
            fileMeta: selectedProject.sourceName,
            durationLabel: selectedProject.transcript
              ? formatDuration(selectedProject.transcript.stats.duration)
              : selectedProject.duration
                ? formatDuration(selectedProject.duration)
                : "Checking length",
            runtimeLabel: selectedProject.runtime ? RUNTIME_LABELS[selectedProject.runtime] : "Browser setup pending",
            modelLabel: selectedProject.runtime ? MODEL_LABELS[selectedProject.runtime] : "Whisper base timestamped",
            fileSizeLabel: formatBytes(selectedProject.sourceSize),
          }
        : {
            fileMeta: "No project selected",
            durationLabel: "No recording yet",
            runtimeLabel: RUNTIME_LABELS[runtime],
            modelLabel: MODEL_LABELS[runtime],
            fileSizeLabel: "0 B",
          },
    [runtime, selectedProject],
  );

  const mediaHandlers = {
    onLoadedMetadata: () => {
      if (pendingSeekRef.current !== null && mediaRef.current) {
        mediaRef.current.currentTime = pendingSeekRef.current;
        setCurrentTime(pendingSeekRef.current);
        pendingSeekRef.current = null;
      }
    },
    onTimeUpdate: () => {
      setCurrentTime(mediaRef.current?.currentTime ?? 0);
    },
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
  };

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
    installState,
    dragActive,
    copied,
    notice,
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
    seekToTime,
    seekByDelta,
    selectSegment,
    selectAdjacentSegment,
    jumpToTranscriptMatch,
    renameSelectedProject,
    updateSelectedSegmentText,
    toggleBookmark: () => upsertMark("bookmark"),
    toggleHighlight: (color: HighlightColor) => upsertMark("highlight", color),
    saveRange,
    removeSavedRange,
    primeTranscriptionModel,
    primeMediaRuntime,
    askForPersistentStorage,
    refreshStorageState,
    resetSetupState,
    promptInstall,
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
