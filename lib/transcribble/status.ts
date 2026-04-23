import type { ProjectStatus, ProjectStep, TranscriptProject } from "@/lib/transcribble/types";

type ProjectTone = "neutral" | "working" | "success" | "warning";

interface StageCopy {
  badgeLabel: string;
  headline: string;
  summary: string;
  tone: ProjectTone;
}

const STAGE_COPY: Record<ProjectStep, StageCopy> = {
  "pending-upload": {
    badgeLabel: "Waiting",
    headline: "Waiting to send",
    summary: "Saved on this device and waiting for the selected transcription backend.",
    tone: "neutral",
  },
  uploading: {
    badgeLabel: "Sending",
    headline: "Sending recording",
    summary: "Sending this recording to the local accelerator.",
    tone: "working",
  },
  queued: {
    badgeLabel: "Queued",
    headline: "Waiting to start",
    summary: "Saved on this device and waiting in line.",
    tone: "neutral",
  },
  "needs-local-helper": {
    badgeLabel: "Local helper",
    headline: "Local accelerator required",
    summary:
      "This recording is saved on this device, but it needs the Transcribble Helper running on this machine before transcription can continue.",
    tone: "warning",
  },
  "getting-local-model": {
    badgeLabel: "Model",
    headline: "Getting the local model ready",
    summary: "Downloading or loading the local model on this machine before transcription starts.",
    tone: "working",
  },
  "getting-browser-ready": {
    badgeLabel: "Setup",
    headline: "Getting this browser ready",
    summary: "Downloading the one-time tools this browser needs before it can transcribe.",
    tone: "working",
  },
  "getting-recording-ready": {
    badgeLabel: "Preparing",
    headline: "Getting your recording ready",
    summary: "Reading the file and preparing the audio on this device.",
    tone: "working",
  },
  probing: {
    badgeLabel: "Probing",
    headline: "Checking the recording",
    summary: "Probing the recording locally before transcription starts.",
    tone: "working",
  },
  "extracting-audio": {
    badgeLabel: "Preparing",
    headline: "Extracting speech audio",
    summary: "Extracting speech audio locally with the accelerator.",
    tone: "working",
  },
  chunking: {
    badgeLabel: "Chunking",
    headline: "Chunking audio",
    summary: "Splitting the speech audio into resumable local chunks.",
    tone: "working",
  },
  transcribing: {
    badgeLabel: "Working",
    headline: "Transcribing now",
    summary: "Building the transcript now.",
    tone: "working",
  },
  merging: {
    badgeLabel: "Merging",
    headline: "Merging transcript",
    summary: "Combining chunk transcripts into one timeline.",
    tone: "working",
  },
  paused: {
    badgeLabel: "Paused",
    headline: "Paused locally",
    summary: "Saved on this device. This recording needs attention before transcription can continue.",
    tone: "warning",
  },
  saving: {
    badgeLabel: "Saving",
    headline: "Saving your session",
    summary: "Finishing the transcript and saving it so you can reopen it later.",
    tone: "working",
  },
  ready: {
    badgeLabel: "Ready",
    headline: "Ready to review",
    summary: "Saved on this device. Search, edit, and export whenever you need it.",
    tone: "success",
  },
  error: {
    badgeLabel: "Problem",
    headline: "Couldn't finish yet",
    summary: "Transcribble hit a problem before this recording could finish.",
    tone: "warning",
  },
  canceled: {
    badgeLabel: "Canceled",
    headline: "Transcription canceled",
    summary: "This recording is still saved on this device, but transcription was canceled.",
    tone: "warning",
  },
};

export interface ProjectStatusCopy extends StageCopy {
  step: ProjectStep;
  statusLabel: string;
  summary: string;
}

export interface ProjectViewState extends ProjectStatusCopy {
  canUseTranscript: boolean;
  canSearchTranscript: boolean;
  canExport: boolean;
  canSaveRanges: boolean;
  transcriptBadgeLabel: string;
  transcriptSearchPlaceholder: string;
  transcriptEmptyTitle: string;
  transcriptEmptyBody: string;
}

export function getDefaultProjectStep(status: ProjectStatus): ProjectStep {
  switch (status) {
    case "pending-upload":
      return "pending-upload";
    case "uploading":
      return "uploading";
    case "queued":
      return "queued";
    case "preparing":
      return "getting-recording-ready";
    case "loading-model":
      return "getting-browser-ready";
    case "extracting-audio":
      return "extracting-audio";
    case "chunking":
      return "chunking";
    case "transcribing":
      return "transcribing";
    case "merging":
      return "merging";
    case "paused":
      return "paused";
    case "ready":
      return "ready";
    case "canceled":
      return "canceled";
    case "error":
      return "error";
    default:
      return "queued";
  }
}

export function getProjectStep(project: Pick<TranscriptProject, "status" | "step">) {
  return project.step ?? getDefaultProjectStep(project.status);
}

export function getProjectStatusCopy(
  project: Pick<TranscriptProject, "status" | "step"> & Partial<Pick<TranscriptProject, "detail" | "error">>,
): ProjectStatusCopy {
  const step = getProjectStep(project);
  const base = STAGE_COPY[step];

  return {
    ...base,
    step,
    statusLabel: base.badgeLabel,
    summary: project.detail || project.error || base.summary,
  };
}

export function getProjectViewState(
  project: Pick<TranscriptProject, "status" | "step" | "transcript"> &
    Partial<Pick<TranscriptProject, "detail" | "error">>,
): ProjectViewState {
  const status = getProjectStatusCopy(project);
  const hasTranscript = Boolean(project.transcript);

  if (hasTranscript) {
    return {
      ...status,
      canUseTranscript: true,
      canSearchTranscript: true,
      canExport: true,
      canSaveRanges: project.status === "ready",
      transcriptBadgeLabel: "Transcript ready",
      transcriptSearchPlaceholder: "Search inside this transcript",
      transcriptEmptyTitle: "Transcript ready",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "error") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "No transcript yet",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "This recording could not finish yet",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "paused") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Paused locally",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Paused locally",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "needs-local-helper") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Local accelerator required",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Local accelerator required",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "queued") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Waiting to start",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "This recording is waiting in line",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "pending-upload" || status.step === "uploading") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: status.step === "uploading" ? "Uploading recording" : "Waiting to upload",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: status.step === "uploading" ? "Uploading recording" : "Waiting to upload",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "getting-browser-ready") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Browser setup in progress",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Getting this browser ready",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "getting-local-model") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Getting the local model ready",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Getting the local model ready",
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "getting-recording-ready") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Preparing recording",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Getting your recording ready",
      transcriptEmptyBody: status.summary,
    };
  }

  if (
    status.step === "probing" ||
    status.step === "extracting-audio" ||
    status.step === "chunking" ||
    status.step === "merging"
  ) {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: status.badgeLabel,
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: status.headline,
      transcriptEmptyBody: status.summary,
    };
  }

  if (status.step === "canceled") {
    return {
      ...status,
      canUseTranscript: false,
      canSearchTranscript: false,
      canExport: false,
      canSaveRanges: false,
      transcriptBadgeLabel: "Transcription canceled",
      transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
      transcriptEmptyTitle: "Transcription canceled",
      transcriptEmptyBody: status.summary,
    };
  }

  return {
    ...status,
    canUseTranscript: false,
    canSearchTranscript: false,
    canExport: false,
    canSaveRanges: false,
    transcriptBadgeLabel: "Transcribing now",
    transcriptSearchPlaceholder: "Search unlocks after the transcript is ready",
    transcriptEmptyTitle: "Transcribing now",
    transcriptEmptyBody: status.summary,
  };
}

export function applyProjectStep<T extends TranscriptProject>(
  project: T,
  options: {
    status?: ProjectStatus;
    step: ProjectStep;
    progress?: number;
    detail?: string;
    error?: string;
  } & Partial<Omit<T, "status" | "step" | "progress" | "detail" | "error" | "stageLabel">>,
) {
  const { status, step, progress, detail, error, ...rest } = options;
  const copy = STAGE_COPY[step];

  return {
    ...project,
    ...rest,
    status: status ?? project.status,
    step,
    progress: progress ?? project.progress,
    stageLabel: copy.headline,
    detail: detail ?? copy.summary,
    error,
  };
}
