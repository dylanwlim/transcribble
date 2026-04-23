"use client";

import {
  LOCAL_ACCELERATOR_CHECK_COMMAND,
  LOCAL_ACCELERATOR_ENDPOINT,
  LOCAL_ACCELERATOR_FALLBACK_ENDPOINT,
  LOCAL_ACCELERATOR_INSTALL_COMMAND,
  LOCAL_ACCELERATOR_START_COMMAND,
} from "@/lib/transcribble/constants";
import type {
  HelperModelProfile,
  LocalHelperCapabilities,
  LocalHelperJob,
  MediaKind,
} from "@/lib/transcribble/types";

const DEFAULT_TIMEOUT_MS = 1_500;
const HELPER_ENDPOINTS = [LOCAL_ACCELERATOR_ENDPOINT, LOCAL_ACCELERATOR_FALLBACK_ENDPOINT];
const JOB_READ_RETRY_DELAYS_MS = [250, 750];
const LOCALHOST_HELPER_UNAVAILABLE_MESSAGE = "Could not reach the Transcribble Helper on localhost.";

export interface CreateLocalHelperJobRequest {
  jobId: string;
  projectId: string;
  sourceName: string;
  sourceType: string;
  sourceSize: number;
  mediaKind: MediaKind;
  modelProfile: HelperModelProfile;
  phraseHints?: string[];
  enableAlignment?: boolean;
  enableDiarization?: boolean;
}

export interface LocalHelperConnection {
  url: string;
  capabilities: LocalHelperCapabilities;
}

async function fetchJsonWithTimeout<T>(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    return response as Response & { json: () => Promise<T> };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function getUnavailableCapabilities(reason: string): LocalHelperCapabilities {
  return {
    available: false,
    url: LOCAL_ACCELERATOR_ENDPOINT,
    models: [],
    reason,
    nextAction:
      `Run ${LOCAL_ACCELERATOR_CHECK_COMMAND} in this repo to diagnose whether ffmpeg, ffprobe, the helper virtualenv, or the localhost service is missing. ` +
      `If the helper is not installed yet, run ${LOCAL_ACCELERATOR_INSTALL_COMMAND}, then ${LOCAL_ACCELERATOR_START_COMMAND}, then ${LOCAL_ACCELERATOR_CHECK_COMMAND} again. ` +
      "If the browser asks whether this site can reach localhost, allow it and refresh.",
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function describeLocalHelperConnectionFailure(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Timed out while waiting for the Transcribble Helper on localhost.";
  }

  const message = error instanceof Error ? error.message.trim() : "";
  const lower = message.toLowerCase();

  if (
    !message ||
    lower === "failed to fetch" ||
    lower.includes("fetch failed") ||
    lower.includes("load failed") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  ) {
    const secureHint =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? " If your browser asks whether this site can reach localhost, allow it and refresh."
        : "";
    return `${LOCALHOST_HELPER_UNAVAILABLE_MESSAGE}${secureHint}`;
  }

  if (lower.includes("health check failed") || lower.includes("capabilities request failed")) {
    return "The Transcribble Helper responded on localhost, but it did not complete its health check.";
  }

  return message;
}

export async function connectToLocalHelper(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<LocalHelperConnection> {
  let lastError: Error | null = null;

  for (const url of HELPER_ENDPOINTS) {
    try {
      const healthResponse = await fetchJsonWithTimeout<{ ok: boolean; version?: string }>(
        `${url}/health`,
        {
          cache: "no-store",
        },
        timeoutMs,
      );

      if (!healthResponse.ok) {
        throw new Error("Local helper health check failed.");
      }

      const capabilitiesResponse = await fetchJsonWithTimeout<LocalHelperCapabilities>(
        `${url}/capabilities`,
        {
          cache: "no-store",
        },
        timeoutMs,
      );

      if (!capabilitiesResponse.ok) {
        throw new Error("Local helper capabilities request failed.");
      }

      const capabilities = await capabilitiesResponse.json();
      return {
        url,
        capabilities: {
          ...capabilities,
          available: true,
          url,
        },
      };
    } catch (error) {
      lastError = new Error(describeLocalHelperConnectionFailure(error) || "Local helper connection failed.");
    }
  }

  throw lastError ?? new Error("Local helper connection failed.");
}

export async function fetchLocalHelperCapabilities(timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const connection = await connectToLocalHelper(timeoutMs);
    return connection.capabilities;
  } catch (error) {
    const message = describeLocalHelperConnectionFailure(error) || LOCALHOST_HELPER_UNAVAILABLE_MESSAGE;
    return getUnavailableCapabilities(message);
  }
}

export async function createLocalHelperJob(
  helperUrl: string,
  payload: CreateLocalHelperJobRequest,
) {
  const response = await fetch(`${helperUrl}/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not create a local helper job.");
  }

  return (await response.json()) as { job: LocalHelperJob };
}

export async function uploadLocalHelperSourceFile(
  helperUrl: string,
  jobId: string,
  file: File,
  onProgress?: (progress: number) => void,
) {
  const endpoint = `${helperUrl}/jobs/${jobId}/source`;

  if (typeof XMLHttpRequest === "undefined" || !onProgress) {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-transcribble-source-name": encodeURIComponent(file.name),
      },
      body: file,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Could not upload the recording to the local helper.");
    }

    return (await response.json()) as { job: LocalHelperJob };
  }

  return new Promise<{ job: LocalHelperJob }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", endpoint, true);
    request.responseType = "json";
    request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.setRequestHeader("x-transcribble-source-name", encodeURIComponent(file.name));

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onerror = () => reject(new Error("Could not upload the recording to the local helper."));
    request.onabort = () => reject(new Error("Local helper upload was canceled."));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        const body =
          typeof request.response === "object" && request.response
            ? (request.response as { error?: string })
            : null;
        reject(new Error(body?.error ?? "Could not upload the recording to the local helper."));
        return;
      }

      onProgress(100);
      resolve(request.response as { job: LocalHelperJob });
    };

    request.send(file);
  });
}

export async function readLocalHelperJob(helperUrl: string, jobId: string) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= JOB_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(`${helperUrl}/jobs/${jobId}`, {
        cache: "no-store",
      });

      if (response.ok) {
        return (await response.json()) as { job: LocalHelperJob };
      }

      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const message = body?.error ?? "Could not load local helper progress.";

      if (response.status < 500 || attempt === JOB_READ_RETRY_DELAYS_MS.length) {
        throw new Error(message);
      }

      lastError = new Error(message);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Could not load local helper progress.");

      if (attempt === JOB_READ_RETRY_DELAYS_MS.length) {
        throw lastError;
      }
    }

    await sleep(JOB_READ_RETRY_DELAYS_MS[attempt] ?? 0);
  }

  throw lastError ?? new Error("Could not load local helper progress.");
}

export async function retryLocalHelperJob(helperUrl: string, jobId: string) {
  const response = await fetch(`${helperUrl}/jobs/${jobId}/retry`, {
    method: "POST",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not retry the local helper job.");
  }

  return (await response.json()) as { job: LocalHelperJob };
}

export async function cancelLocalHelperJob(helperUrl: string, jobId: string) {
  await fetch(`${helperUrl}/jobs/${jobId}/cancel`, {
    method: "POST",
  });
}
