import assert from "node:assert/strict";
import http from "node:http";
import test, { afterEach } from "node:test";

import {
  createLocalHelperJob,
  fetchLocalHelperCapabilities,
  readLocalHelperJob,
  uploadLocalHelperSourceFile,
} from "@/lib/transcribble/local-helper-client";
import { planLocalHelperChunks } from "@/lib/transcribble/local-helper-chunking";
import { mergeLocalHelperTranscriptChunks } from "@/lib/transcribble/local-helper-merge";
import { projectNeedsHelperReconnect, syncLocalHelperJobIntoProject } from "@/lib/transcribble/local-helper-state";
import { assertUsableAudioStream } from "@/lib/transcribble/media-probe";
import { createProjectFromImportedFile, recoverPersistedProjects } from "@/lib/transcribble/projects";
import { chooseTranscriptionBackend } from "@/lib/transcribble/transcription-backends";
import type { LocalHelperJob, TranscriptProject } from "@/lib/transcribble/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("chooseTranscriptionBackend keeps smaller files on the browser path", () => {
  const decision = chooseTranscriptionBackend(
    new File(["hello"], "standup.m4a", {
      type: "audio/mp4",
    }),
    {
      browserLocalAvailable: true,
      helperAvailable: true,
      deviceMemoryGb: 16,
      hardwareConcurrency: 8,
    },
  );

  assert.equal(decision.backend, "browser");
});

test("chooseTranscriptionBackend routes a 1.1 GB mp4 to the local helper", () => {
  const file = makeSizedFile("all-hands.mp4", "video/mp4", 1.1 * 1024 * 1024 * 1024);

  const decision = chooseTranscriptionBackend(file, {
    browserLocalAvailable: true,
    helperAvailable: true,
    deviceMemoryGb: 8,
    hardwareConcurrency: 4,
  });

  assert.equal(decision.backend, "local-helper");
  assert.match(decision.reason, /local accelerator/i);
});

test("chooseTranscriptionBackend requires the helper after one failed browser attempt", () => {
  const decision = chooseTranscriptionBackend(
    new File(["hello"], "retry.m4a", {
      type: "audio/mp4",
    }),
    {
      browserLocalAvailable: true,
      helperAvailable: true,
      previousBrowserFailure: true,
      deviceMemoryGb: 16,
      hardwareConcurrency: 8,
    },
  );

  assert.equal(decision.backend, "local-helper");
  assert.match(decision.reason, /failed once in browser mode/i);
});

test("chooseTranscriptionBackend pauses on helper-required media when the helper is missing", () => {
  const decision = chooseTranscriptionBackend(
    makeSizedFile("archive.mp4", "video/mp4", 1.1 * 1024 * 1024 * 1024),
    {
      browserLocalAvailable: true,
      helperAvailable: false,
      deviceMemoryGb: 8,
      hardwareConcurrency: 4,
    },
  );

  assert.equal(decision.backend, "local-helper");
  assert.equal(decision.requiresHelperInstall, true);
  assert.match(decision.reason, /Transcribble Helper running on this machine/i);
});

test("planLocalHelperChunks splits long recordings with overlap", () => {
  const chunks = planLocalHelperChunks({
    durationSec: 7_200,
  });

  assert.ok(chunks.length >= 2);
  assert.equal(chunks[1]?.primaryStartMs, chunks[0]?.primaryEndMs);
  assert.equal((chunks[1]?.primaryStartMs ?? 0) - (chunks[1]?.startMs ?? 0), 2_000);
});

test("mergeLocalHelperTranscriptChunks offsets later chunks and drops overlap duplicates", () => {
  const merged = mergeLocalHelperTranscriptChunks([
    {
      chunkIndex: 0,
      startMs: 0,
      endMs: 10_000,
      primaryStartMs: 0,
      primaryEndMs: 10_000,
      payload: {
        text: "Hello boundary",
        chunks: [
          {
            text: "Hello",
            timestamp: [0, 2],
            words: [{ text: "Hello", start: 0, end: 0.4, confidence: 0.9 }],
          },
          { text: "Boundary", timestamp: [8, 10] },
        ],
      },
    },
    {
      chunkIndex: 1,
      startMs: 7_500,
      endMs: 18_000,
      primaryStartMs: 10_000,
      primaryEndMs: 18_000,
      payload: {
        text: "Boundary world",
        chunks: [
          { text: "Boundary", timestamp: [0.5, 2.5] },
          { text: "World", timestamp: [4, 6] },
        ],
      },
    },
  ]);

  assert.deepEqual(
    merged.chunks?.map((chunk) => chunk.text),
    ["Hello", "Boundary", "World"],
  );
  assert.equal(merged.chunks?.[2]?.timestamp[0], 11.5);
  assert.equal(merged.chunks?.[0]?.words?.[0]?.start, 0);
  assert.equal(merged.chunks?.[0]?.words?.[0]?.end, 0.4);
});

test("assertUsableAudioStream fails clearly when the media has no audio", () => {
  assert.throws(
    () =>
      assertUsableAudioStream({
        format: {
          duration: "120.5",
        },
        streams: [{ index: 0, codec_type: "video" }],
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      (error as Error & { code?: string }).code === "no_audio_track",
  );
});

test("recoverPersistedProjects keeps local-helper jobs available for reconnect after refresh", () => {
  const project = createProjectFromImportedFile(
    new File(["x"], "meeting.mp4", { type: "video/mp4" }),
    "wasm",
    "local-helper",
  );
  const recovered = recoverPersistedProjects([
    {
      ...project,
      backend: "local-helper",
      backendJobId: "job-1",
      status: "transcribing",
      step: "transcribing",
    },
  ]);

  assert.equal(recovered[0]?.backend, "local-helper");
  assert.equal(projectNeedsHelperReconnect(recovered[0] as TranscriptProject), true);
});

test("syncLocalHelperJobIntoProject maps model download progress into a helper-specific project step", () => {
  const project = createProjectFromImportedFile(
    new File(["x"], "meeting.mp4", { type: "video/mp4" }),
    "wasm",
    "local-helper",
  );
  const synced = syncLocalHelperJobIntoProject(project, {
    id: "job-1",
    projectId: project.id,
    sourceName: "meeting.mp4",
    sourceType: "video/mp4",
    sourceSize: 1.1 * 1024 * 1024 * 1024,
    mediaKind: "video",
    status: "downloading_model",
    progress: 21,
    detail: "Downloading the fast local model on this machine. 640 MB cached locally so far.",
    createdAt: "2026-04-23T12:00:00Z",
    updatedAt: "2026-04-23T12:00:02Z",
    modelProfile: "fast",
    modelDownloadBytes: 640 * 1024 * 1024,
  });

  assert.equal(synced.status, "preparing");
  assert.equal(synced.step, "getting-local-model");
  assert.match(synced.detail, /640 MB cached locally/i);
});

test("fetchLocalHelperCapabilities detects a reachable helper and helper job sync survives multiple chunks", async (t) => {
  const baseJob: LocalHelperJob = {
    id: "job-1",
    projectId: "project-1",
    sourceName: "meeting.mp4",
    sourceType: "video/mp4",
    sourceSize: 1.1 * 1024 * 1024 * 1024,
    mediaKind: "video",
    status: "queued",
    progress: 0,
    detail: "Queued",
    createdAt: "2026-04-23T12:00:00Z",
    updatedAt: "2026-04-23T12:00:00Z",
    modelProfile: "fast",
    totalChunks: 2,
    completedChunks: 0,
    sourceUploaded: false,
    resume: {},
  };

  let job = { ...baseJob };
  const server = http.createServer(async (request, response) => {
    const url = request.url ?? "/";
    response.setHeader("content-type", "application/json");
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type,x-transcribble-source-name");

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (request.method === "GET" && url === "/health") {
      response.end(JSON.stringify({ ok: true, protocolVersion: "1", version: "test" }));
      return;
    }

    if (request.method === "GET" && url === "/capabilities") {
      response.end(
        JSON.stringify({
          available: true,
          url: "http://127.0.0.1:7771",
          protocolVersion: "1",
          backend: "stub",
          backendLabel: "Stub backend",
          ffmpegReady: true,
          ffprobeReady: true,
          supportsWordTimestamps: true,
          supportsAlignment: false,
          supportsDiarization: false,
          cacheBytes: 0,
          models: [],
          nextAction: "Run npm run helper:start if the helper is not already running.",
        }),
      );
      return;
    }

    if (request.method === "POST" && url === "/jobs") {
      response.end(JSON.stringify({ job }));
      return;
    }

    if (request.method === "PUT" && url === "/jobs/job-1/source") {
      for await (const chunk of request) {
        // Drain the request stream.
        void chunk;
      }
      job = {
        ...job,
        status: "transcribing",
        progress: 72,
        detail: "Transcribing chunk 2 of 2 locally.",
        sourceUploaded: true,
        completedChunks: 1,
      };
      response.end(JSON.stringify({ job }));
      return;
    }

    if (request.method === "GET" && url === "/jobs/job-1") {
      response.end(
        JSON.stringify({
          job: {
            ...job,
            status: "completed",
            progress: 100,
            detail: "Saved on this device. The local accelerator transcript is ready to review.",
            completedChunks: 2,
            totalChunks: 2,
            backend: "stub",
            backendLabel: "Stub backend",
            modelName: "stub-local-model",
            durationSec: 1800,
            transcript: {
              text: "Kickoff notes Budget review",
              chunks: [
                { text: "Kickoff notes", timestamp: [0, 30] },
                { text: "Budget review", timestamp: [1500, 1530] },
              ],
            },
            resume: {
              totalChunks: 2,
              completedChunks: 2,
              completedChunkIndexes: [0, 1],
              nextChunkIndex: null,
            },
          },
        }),
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const helperBaseUrl = `http://127.0.0.1:${address.port}`;

  globalThis.fetch = (input, init) => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const rewritten = requestUrl
      .replace("http://127.0.0.1:7771", helperBaseUrl)
      .replace("http://localhost:7771", helperBaseUrl);
    return originalFetch(rewritten, init);
  };

  const capabilities = await fetchLocalHelperCapabilities();
  assert.equal(capabilities.available, true);
  assert.equal(capabilities.protocolVersion, "1");

  const created = await createLocalHelperJob(helperBaseUrl, {
    jobId: "job-1",
    projectId: "project-1",
    sourceName: "meeting.mp4",
    sourceType: "video/mp4",
    sourceSize: 1.1 * 1024 * 1024 * 1024,
    mediaKind: "video",
    modelProfile: "fast",
  });
  assert.equal(created.job.id, "job-1");

  const uploaded = await uploadLocalHelperSourceFile(
    helperBaseUrl,
    "job-1",
    new File(["chunk"], "meeting.mp4", { type: "video/mp4" }),
  );
  assert.equal(uploaded.job.status, "transcribing");

  const completed = await readLocalHelperJob(helperBaseUrl, "job-1");
  const project = createProjectFromImportedFile(
    new File(["x"], "meeting.mp4", { type: "video/mp4" }),
    "wasm",
    "local-helper",
  );
  const synced = syncLocalHelperJobIntoProject(project, completed.job);

  assert.equal(synced.status, "ready");
  assert.equal(synced.transcript?.chunks.length, 2);
  assert.equal(synced.resumeState?.completedChunks, 2);
});

test("fetchLocalHelperCapabilities normalizes raw browser fetch failures into localhost guidance", async () => {
  globalThis.fetch = async () => {
    throw new Error("Failed to fetch");
  };

  const capabilities = await fetchLocalHelperCapabilities();

  assert.equal(capabilities.available, false);
  assert.doesNotMatch(capabilities.reason ?? "", /^Failed to fetch$/i);
  assert.match(capabilities.reason ?? "", /localhost/i);
  assert.match(capabilities.nextAction ?? "", /helper:check/i);
});

test("readLocalHelperJob retries a transient helper 500 before failing", async (t) => {
  let attempts = 0;
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.setHeader("access-control-allow-origin", "*");

    if (request.method === "GET" && request.url === "/jobs/job-retry") {
      attempts += 1;

      if (attempts === 1) {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: "helper write in progress" }));
        return;
      }

      response.end(
        JSON.stringify({
          job: {
            id: "job-retry",
            projectId: "project-retry",
            sourceName: "meeting.mp4",
            sourceType: "video/mp4",
            sourceSize: 1.1 * 1024 * 1024 * 1024,
            mediaKind: "video",
            status: "transcribing",
            progress: 62,
            detail: "Transcribing chunk 3 of 15 locally.",
            createdAt: "2026-04-23T12:00:00Z",
            updatedAt: "2026-04-23T12:00:05Z",
            modelProfile: "fast",
            totalChunks: 15,
            completedChunks: 2,
            sourceUploaded: true,
            resume: {
              totalChunks: 15,
              completedChunks: 2,
              completedChunkIndexes: [0, 1],
              nextChunkIndex: 2,
            },
          },
        }),
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  t.after(() => server.close());

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const helperBaseUrl = `http://127.0.0.1:${address.port}`;

  const job = await readLocalHelperJob(helperBaseUrl, "job-retry");
  assert.equal(job.job.status, "transcribing");
  assert.equal(attempts, 2);
});

function makeSizedFile(name: string, type: string, size: number) {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", {
    configurable: true,
    value: size,
  });
  return file;
}
