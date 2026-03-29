"use client";

import {
  useCallback,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LOCAL_PROCESSING_NOTE,
  MODEL_LABELS,
  RUNTIME_LABELS,
  type Runtime,
} from "@/lib/transcribble/constants";
import {
  describeFile,
  detectPreferredRuntime,
  getInputAcceptValue,
  getLocalInferenceCapabilityIssue,
  humanizePreparationError,
  prepareAudioForTranscription,
  validateMediaFile,
} from "@/lib/transcribble/media";
import {
  buildReadableTranscript,
  countCharacters,
  countWords,
  formatBytes,
  formatDuration,
  type TranscriptChunk,
} from "@/lib/transcribble/transcript";

export type TranscribbleStage =
  | "idle"
  | "preparing"
  | "loading-model"
  | "transcribing"
  | "success"
  | "error";

interface WorkerProgressItem {
  file: string;
  progress: number;
  total?: number;
  loaded?: number;
}

interface TranscriptResult {
  plainText: string;
  chunks: TranscriptChunk[];
  duration: number;
  wordCount: number;
  characterCount: number;
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

export function useTranscribble() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const copyTimeoutRef = useRef<number | null>(null);
  const mediaReadyRef = useRef(false);

  const [stage, setStage] = useState<TranscribbleStage>("idle");
  const [message, setMessage] = useState("Drop a file to begin");
  const [detail, setDetail] = useState(LOCAL_PROCESSING_NOTE);
  const [progress, setProgress] = useState(0);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [progressItems, setProgressItems] = useState<WorkerProgressItem[]>([]);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [runtime, setRuntime] = useState<Runtime>("wasm");
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [capabilityIssue, setCapabilityIssue] = useState<string | null>(null);
  const durationRef = useRef<number | null>(null);

  const isBusy = stage === "preparing" || stage === "loading-model" || stage === "transcribing";

  useEffect(() => {
    let cancelled = false;

    setCapabilityIssue(getLocalInferenceCapabilityIssue());
    detectPreferredRuntime().then((detectedRuntime) => {
      if (!cancelled) {
        setRuntime(detectedRuntime);
      }
    });

    return () => {
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;

      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const resetState = useCallback((hardReset: boolean) => {
    runIdRef.current += 1;
    mediaReadyRef.current = false;
    durationRef.current = null;

    if (hardReset) {
      workerRef.current?.terminate();
      workerRef.current = null;
    }

    setStage("idle");
    setMessage("Drop a file to begin");
    setDetail(LOCAL_PROCESSING_NOTE);
    setProgress(0);
    setMediaProgress(null);
    setProgressItems([]);
    setCurrentFile(null);
    setDuration(null);
    setTranscript(null);
    setPartialTranscript("");
    setError(null);
    setDragActive(false);
    setCopied(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }

    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
  }, []);

  const finishWithError = useCallback((friendlyMessage: string) => {
    setStage("error");
    setError(friendlyMessage);
    setMessage("Local transcription hit a problem");
    setDetail(friendlyMessage);
    setProgress(0);
    setMediaProgress(null);
  }, []);

  const handleWorkerMessage = useCallback((event: MessageEvent<WorkerMessage>) => {
    const payload = event.data;

    if (payload.jobId !== runIdRef.current) {
      return;
    }

    switch (payload.status) {
      case "loading":
        setStage((previous) => (previous === "preparing" ? previous : "loading-model"));
        setMessage("Loading the local model");
        setDetail(payload.data ?? LOCAL_PROCESSING_NOTE);
        break;

      case "initiate":
        if (payload.file) {
          const file = payload.file;
          setProgressItems((items) => [
            ...items,
            {
              file,
              progress: 0,
              total: payload.total,
              loaded: payload.loaded,
            },
          ]);
        }
        break;

      case "progress":
        if (payload.file) {
          setProgressItems((items) =>
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
        setProgress((value) => Math.max(value, Math.round(((payload.progress ?? 0) / 100) * 42) + 12));
        break;

      case "done":
        if (payload.file) {
          setProgressItems((items) => items.filter((item) => item.file !== payload.file));
        }
        setProgress((value) => Math.max(value, 56));
        break;

      case "ready":
        if (!mediaReadyRef.current) {
          setStage("loading-model");
          setMessage("Model is ready");
          setDetail("Finishing media prep before transcription starts.");
          setProgress((value) => Math.max(value, 58));
        }
        break;

      case "runtime-fallback":
        setRuntime("wasm");
        setDetail(payload.data ?? "WebGPU was unavailable, so the browser switched to a local CPU fallback.");
        break;

      case "partial":
        if (!payload.result) {
          return;
        }

        {
          const result = payload.result;

        startTransition(() => {
          setStage("transcribing");
          setMessage("Transcribing on-device");
          setDetail(
            payload.device === "webgpu"
              ? "The browser is transcribing locally with GPU acceleration."
              : "The browser is transcribing locally with a CPU fallback.",
          );
          setPartialTranscript(buildReadableTranscript(result));
        });
        }

        setProgress((value) => Math.max(value, Math.round(((payload.progress ?? 0) / 100) * 34) + 58));
        break;

      case "complete":
        if (!payload.result) {
          return;
        }

        {
          const result = payload.result;

        startTransition(() => {
          const plainText = buildReadableTranscript(result);
          const transcriptDuration = durationRef.current ?? 0;

          setTranscript({
            plainText,
            chunks: result.chunks ?? [],
            duration: transcriptDuration,
            wordCount: countWords(plainText),
            characterCount: countCharacters(plainText),
          });
          setPartialTranscript(plainText);
        });
        }

        setStage("success");
        setMessage("Transcript ready");
        setDetail("Everything above was processed locally in your browser.");
        setProgress(100);
        setMediaProgress(null);
        setError(null);
        break;

      case "error":
        finishWithError(
          payload.data?.toLowerCase().includes("memory")
            ? "The browser ran out of memory while transcribing. Try a shorter file or use a desktop browser."
            : payload.data ?? "Local transcription failed. Try again with a smaller file or a recent Chrome/Edge build.",
        );
        break;

      default:
        break;
    }
  }, [finishWithError]);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("../workers/transcriber.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current.addEventListener("message", handleWorkerMessage);
    }

    return workerRef.current;
  }, [handleWorkerMessage]);

  const startFileJob = useCallback(async (file: File) => {
    const validation = validateMediaFile(file);

    if (!validation.ok) {
      finishWithError(validation.error ?? "Choose a supported media file.");
      return;
    }

    if (capabilityIssue) {
      finishWithError(capabilityIssue);
      return;
    }

    runIdRef.current += 1;
    mediaReadyRef.current = false;
    const jobId = runIdRef.current;

    setCurrentFile(file);
    setDuration(null);
    durationRef.current = null;
    setTranscript(null);
    setPartialTranscript("");
    setError(null);
    setProgressItems([]);
    setCopied(false);
    setStage("preparing");
    setMessage("Preparing your media");
    setDetail("Reading the file locally before transcription starts.");
    setProgress(8);
    setMediaProgress(0);

    const activeWorker = getWorker();
    activeWorker.postMessage({
      type: "preload",
      jobId,
      device: runtime,
    });

    try {
      const prepared = await prepareAudioForTranscription(file, {
        onStatus: (nextDetail) => {
          if (jobId !== runIdRef.current) {
            return;
          }

          setStage("preparing");
          setDetail(nextDetail);
        },
        onProgress: (nextProgress) => {
          if (jobId !== runIdRef.current || nextProgress === null) {
            return;
          }

          setMediaProgress(nextProgress);
          setProgress((value) => Math.max(value, Math.round((nextProgress / 100) * 22) + 10));
        },
      });

      if (jobId !== runIdRef.current) {
        return;
      }

      mediaReadyRef.current = true;
      setDuration(prepared.duration);
      durationRef.current = prepared.duration;
      setMediaProgress(null);
      setStage("transcribing");
      setMessage("Transcribing on-device");
      setDetail("The browser is decoding speech locally. Large files can take a while on slower hardware.");
      setProgress((value) => Math.max(value, 60));

      activeWorker.postMessage(
        {
          type: "transcribe",
          jobId,
          device: runtime,
          audio: prepared.audio,
          duration: prepared.duration,
        },
        [prepared.audio.buffer],
      );
    } catch (preparationError) {
      if (jobId !== runIdRef.current) {
        return;
      }

      finishWithError(humanizePreparationError(preparationError));
    }
  }, [capabilityIssue, finishWithError, getWorker, runtime]);

  const openFilePicker = useCallback(() => {
    if (!isBusy) {
      inputRef.current?.click();
    }
  }, [isBusy]);

  const onFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      finishWithError("Choose a file to transcribe.");
      return;
    }

    void startFileJob(file);
  }, [finishWithError, startFileJob]);

  const onDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);

    if (isBusy) {
      return;
    }

    const file = event.dataTransfer.files?.[0] ?? null;
    if (!file) {
      finishWithError("Drop a media file to start transcription.");
      return;
    }

    void startFileJob(file);
  }, [finishWithError, isBusy, startFileJob]);

  const onCopyTranscript = useCallback(async () => {
    if (!transcript?.plainText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(transcript.plainText);
      setCopied(true);

      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }

      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      finishWithError("Clipboard access failed. Try copying from the transcript panel directly.");
    }
  }, [finishWithError, transcript]);

  const onDownloadTranscript = useCallback(() => {
    if (!transcript?.plainText) {
      return;
    }

    const baseName = currentFile?.name.replace(/\.[^.]+$/, "") || "transcribble";
    const blob = new Blob([transcript.plainText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}-transcript.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }, [currentFile, transcript]);

  const sessionSummary = useMemo(
    () => ({
      fileMeta: describeFile(currentFile),
      durationLabel: duration ? formatDuration(duration) : "Not ready yet",
      runtimeLabel: RUNTIME_LABELS[runtime],
      modelLabel: MODEL_LABELS[runtime],
      fileSizeLabel: currentFile ? formatBytes(currentFile.size) : "No file selected",
    }),
    [currentFile, duration, runtime],
  );

  return {
    inputRef,
    stage,
    message,
    detail,
    progress,
    mediaProgress,
    progressItems,
    currentFile,
    transcript,
    partialTranscript,
    error,
    dragActive,
    copied,
    runtime,
    capabilityIssue,
    isBusy,
    accept: getInputAcceptValue(),
    sessionSummary,
    openFilePicker,
    onFileInputChange,
    onDrop,
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (!isBusy) {
        setDragActive(true);
      }
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(false);
    },
    onReset: () => resetState(isBusy),
    onCopyTranscript,
    onDownloadTranscript,
  };
}
