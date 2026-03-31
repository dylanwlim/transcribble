/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";

import { MODEL_ID, type Runtime } from "@/lib/transcribble/constants";
import type { TranscriptChunk } from "@/lib/transcribble/types";

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;

const PIPELINE_OPTIONS: Record<Runtime, Record<string, unknown>> = {
  webgpu: {
    device: "webgpu",
    dtype: {
      encoder_model: "fp32",
      decoder_model_merged: "q4",
    },
  },
  wasm: {
    device: "wasm",
    dtype: "q8",
  },
};

interface LoadMessage {
  type: "preload";
  jobId: number;
  device: Runtime;
}

interface TranscribeMessage {
  type: "transcribe";
  jobId: number;
  device: Runtime;
  audio: Float32Array;
  duration: number;
}

type WorkerRequest = LoadMessage | TranscribeMessage;

interface DecodedResult {
  text: string;
  chunks: TranscriptChunk[];
}

type AsrTokenizer = {
  _decode_asr: (
    chunks: Array<{ tokens: number[]; finalised: boolean }>,
    options: {
      time_precision: number;
      return_timestamps: boolean;
      force_full_sequences: boolean;
    },
  ) => DecodedResult;
};

type ProgressPayload = {
  status: string;
  file?: string;
  progress?: number;
  total?: number;
  loaded?: number;
  name?: string;
};

type TranscriberInstance = ((
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<DecodedResult>) & {
  tokenizer: AsrTokenizer;
  processor?: {
    feature_extractor?: {
      config?: {
        chunk_length?: number;
      };
    };
  };
  model?: {
    config?: {
      max_source_positions?: number;
    };
  };
  dispose?: () => Promise<void> | void;
};

let cachedRuntime: Runtime | null = null;
let cachedPipelinePromise: Promise<TranscriberInstance> | null = null;
let warmedWebGPU = false;

async function disposePipeline() {
  if (cachedPipelinePromise) {
    const maybePipeline = await cachedPipelinePromise.catch(() => null);
    await maybePipeline?.dispose?.();
  }

  cachedPipelinePromise = null;
  cachedRuntime = null;
}

function forwardProgress(jobId: number, device: Runtime) {
  return (payload: ProgressPayload) => {
    self.postMessage({
      ...payload,
      jobId,
      device,
    });
  };
}

async function getTranscriber(jobId: number, device: Runtime) {
  if (!cachedPipelinePromise || cachedRuntime !== device) {
    await disposePipeline();
    cachedRuntime = device;
    cachedPipelinePromise = pipeline("automatic-speech-recognition", MODEL_ID, {
      ...PIPELINE_OPTIONS[device],
      progress_callback: forwardProgress(jobId, device),
    }) as unknown as Promise<TranscriberInstance>;
  }

  return cachedPipelinePromise;
}

async function loadPipeline(
  jobId: number,
  requestedDevice: Runtime,
): Promise<{ device: Runtime; transcriber: TranscriberInstance }> {
  try {
    self.postMessage({
      status: "loading",
      data: requestedDevice === "webgpu" ? "Loading the local model with WebGPU..." : "Loading the local model...",
      jobId,
      device: requestedDevice,
    });

    const transcriber = await getTranscriber(jobId, requestedDevice);

    if (requestedDevice === "webgpu" && !warmedWebGPU) {
      self.postMessage({
        status: "loading",
        data: "Compiling shaders and warming up the local model...",
        jobId,
        device: requestedDevice,
      });
      await transcriber(new Float32Array(16_000), {
        language: "en",
      });
      warmedWebGPU = true;
    }

    self.postMessage({
      status: "ready",
      jobId,
      device: requestedDevice,
    });

    return { device: requestedDevice, transcriber };
  } catch (error) {
    if (requestedDevice === "webgpu") {
      await disposePipeline();
      self.postMessage({
        status: "runtime-fallback",
        data: "WebGPU was unavailable, so the worker switched to a WebAssembly fallback.",
        jobId,
        device: "wasm",
      });
      return loadPipeline(jobId, "wasm");
    }

    throw error;
  }
}

function estimateProgress(chunks: TranscriptChunk[] | undefined, duration: number) {
  if (!chunks?.length || !duration) {
    return 8;
  }

  const lastChunk = [...chunks].reverse().find((chunk) => typeof chunk.timestamp?.[1] === "number");
  const currentTime = lastChunk?.timestamp[1] ?? lastChunk?.timestamp[0] ?? 0;

  if (!Number.isFinite(currentTime) || currentTime <= 0) {
    return 8;
  }

  return Math.min(100, Math.max(10, (currentTime / duration) * 100));
}

async function runTranscription(message: TranscribeMessage) {
  const { jobId, duration, audio } = message;
  const { device, transcriber } = await loadPipeline(jobId, message.device);

  const tokenizer = transcriber.tokenizer as AsrTokenizer;
  const featureExtractorConfig = transcriber.processor?.feature_extractor?.config ?? {};
  const chunkLength = Number(featureExtractorConfig.chunk_length ?? 30);
  const maxSourcePositions = Number(transcriber.model?.config?.max_source_positions ?? 1500);
  const timePrecision = chunkLength / maxSourcePositions;

  const chunksToProcess: Array<{ tokens: number[]; finalised: boolean }> = [
    {
      tokens: [],
      finalised: false,
    },
  ];

  function chunkCallback(chunk: { is_last: boolean }) {
    const current = chunksToProcess[chunksToProcess.length - 1];
    Object.assign(current, chunk);
    current.finalised = true;

    if (!chunk.is_last) {
      chunksToProcess.push({
        tokens: [],
        finalised: false,
      });
    }
  }

  function callbackFunction(items: Array<{ output_token_ids: number[] }>) {
    const current = chunksToProcess[chunksToProcess.length - 1];
    current.tokens = [...(items[0]?.output_token_ids ?? [])];

    const decoded = tokenizer._decode_asr(chunksToProcess, {
      time_precision: timePrecision,
      return_timestamps: true,
      force_full_sequences: false,
    });

    self.postMessage({
      status: "partial",
      jobId,
      device,
      result: decoded,
      progress: estimateProgress(decoded.chunks, duration),
    });
  }

  try {
    const result = await transcriber(audio, {
      top_k: 0,
      do_sample: false,
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      force_full_sequences: false,
      callback_function: callbackFunction,
      chunk_callback: chunkCallback,
    });

    self.postMessage({
      status: "complete",
      jobId,
      device,
      progress: 100,
      result,
    });
  } catch (error) {
    self.postMessage({
      status: "error",
      jobId,
      device,
      data: error instanceof Error ? error.message : "Transcription failed locally.",
    });
  }
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === "preload") {
      await loadPipeline(message.jobId, message.device);
      return;
    }

    await runTranscription(message);
  } catch (error) {
    self.postMessage({
      status: "error",
      jobId: message.jobId,
      device: message.device,
      data: error instanceof Error ? error.message : "Local transcription failed.",
    });
  }
});

export {};
