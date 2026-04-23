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
          { text: "Hello", timestamp: [0, 2] },
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
      response.end(JSON.stringify({ ok: true, version: "test" }));
      return;
    }

    if (request.method === "GET" && url === "/capabilities") {
      response.end(
        JSON.stringify({
          available: true,
          url: "http://127.0.0.1:7771",
          backend: "stub",
          backendLabel: "Stub backend",
          ffmpegReady: true,
          ffprobeReady: true,
          supportsWordTimestamps: true,
          supportsAlignment: false,
          supportsDiarization: false,
          cacheBytes: 0,
          models: [],
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

function makeSizedFile(name: string, type: string, size: number) {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", {
    configurable: true,
    value: size,
  });
  return file;
}
