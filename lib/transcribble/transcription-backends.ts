import { getFileExtension } from "@/lib/transcribble/media";
import {
  LOCAL_ACCELERATOR_REQUIRED_NOTE,
  VIDEO_EXTENSIONS,
} from "@/lib/transcribble/constants";
import type {
  MediaKind,
  TranscriptionBackend,
} from "@/lib/transcribble/types";

export interface TranscriptionBackendEnvironment {
  browserLocalAvailable: boolean;
  helperAvailable: boolean;
  previousBrowserFailure?: boolean;
  deviceMemoryGb?: number | null;
  hardwareConcurrency?: number | null;
}

export interface TranscriptionBackendDecision {
  backend: TranscriptionBackend;
  automatic: boolean;
  mediaKind: MediaKind;
  reason: string;
  requiresHelperInstall?: boolean;
}

const ALWAYS_HELPER_BYTES = 192 * 1024 * 1024;
const VIDEO_HELPER_BYTES = 96 * 1024 * 1024;
const LOW_CORE_RISK_BYTES = 96 * 1024 * 1024;

export function inferTranscriptionMediaKind(file: Pick<File, "name" | "type">): MediaKind {
  const extension = getFileExtension(file.name);
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  if (extension === ".webm") {
    return file.type.startsWith("video/") ? "video" : "audio";
  }

  return "audio";
}

function buildHelperRequiredDecision(mediaKind: MediaKind, reason: string): TranscriptionBackendDecision {
  return {
    backend: "local-helper",
    automatic: true,
    mediaKind,
    reason: `${reason} ${LOCAL_ACCELERATOR_REQUIRED_NOTE}`,
    requiresHelperInstall: true,
  };
}

export function chooseTranscriptionBackend(
  file: Pick<File, "name" | "size" | "type">,
  env: TranscriptionBackendEnvironment,
): TranscriptionBackendDecision {
  const mediaKind = inferTranscriptionMediaKind(file);

  if (env.previousBrowserFailure) {
    if (env.helperAvailable) {
      return {
        backend: "local-helper",
        automatic: true,
        mediaKind,
        reason:
          "This recording already failed once in browser mode, so Transcribble will retry it with the local accelerator.",
      };
    }

    return buildHelperRequiredDecision(
      mediaKind,
      "This recording already failed once in browser mode.",
    );
  }

  if (!env.browserLocalAvailable) {
    if (env.helperAvailable) {
      return {
        backend: "local-helper",
        automatic: true,
        mediaKind,
        reason:
          "This browser does not have a reliable local transcription runtime, so Transcribble will use the local accelerator.",
      };
    }

    return buildHelperRequiredDecision(
      mediaKind,
      "This browser does not have a reliable local transcription runtime.",
    );
  }

  if (file.size >= ALWAYS_HELPER_BYTES) {
    if (env.helperAvailable) {
      return {
        backend: "local-helper",
        automatic: true,
        mediaKind,
        reason:
          "This recording is large enough that the browser path is likely to hit memory limits, so Transcribble will use the local accelerator.",
      };
    }

    return buildHelperRequiredDecision(
      mediaKind,
      "This recording is too large for the safe browser path.",
    );
  }

  if (mediaKind === "video" && file.size >= VIDEO_HELPER_BYTES) {
    if (env.helperAvailable) {
      return {
        backend: "local-helper",
        automatic: true,
        mediaKind,
        reason:
          "This video is large enough that extracting audio in-browser is risky, so Transcribble will use the local accelerator.",
      };
    }

    return buildHelperRequiredDecision(
      mediaKind,
      "This video is too large for reliable in-browser audio extraction.",
    );
  }

  if (typeof env.deviceMemoryGb === "number" && env.deviceMemoryGb > 0) {
    const memoryBudgetBytes =
      env.deviceMemoryGb *
      1024 *
      1024 *
      1024 *
      (mediaKind === "video" ? 0.05 : 0.08);

    if (file.size > memoryBudgetBytes) {
      if (env.helperAvailable) {
        return {
          backend: "local-helper",
          automatic: true,
          mediaKind,
          reason:
            "This recording is likely to exceed the browser memory budget on this device, so Transcribble will use the local accelerator.",
        };
      }

      return buildHelperRequiredDecision(
        mediaKind,
        "This recording is likely to exceed the browser memory budget on this device.",
      );
    }
  }

  if (
    typeof env.hardwareConcurrency === "number" &&
    env.hardwareConcurrency > 0 &&
    env.hardwareConcurrency <= 4 &&
    file.size >= LOW_CORE_RISK_BYTES
  ) {
    if (env.helperAvailable) {
      return {
        backend: "local-helper",
        automatic: true,
        mediaKind,
        reason:
          "This device has limited runtime headroom for a longer browser pass, so Transcribble will use the local accelerator.",
      };
    }

    return buildHelperRequiredDecision(
      mediaKind,
      "This device has limited runtime headroom for a longer browser pass.",
    );
  }

  return {
    backend: "browser",
    automatic: false,
    mediaKind,
    reason: "This recording is small enough for the browser-local transcription path.",
  };
}

export function getBackendLabel(backend?: TranscriptionBackend) {
  switch (backend) {
    case "local-helper":
      return "Local accelerator";
    case "browser":
    default:
      return "Browser transcription";
  }
}
