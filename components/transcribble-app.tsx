"use client";

import { useDeferredValue } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileAudio,
  FileText,
  Grip,
  HardDriveUpload,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  AudioLines,
  Upload,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useTranscribble } from "@/hooks/use-transcribble";
import { APP_NAME, LOCAL_PROCESSING_NOTE, MAX_FILE_SIZE_LABEL, SUPPORTED_EXTENSIONS } from "@/lib/transcribble/constants";
import { formatDuration } from "@/lib/transcribble/transcript";

const STEP_ITEMS = [
  {
    key: "idle",
    label: "Upload media",
    icon: Upload,
  },
  {
    key: "transcribing",
    label: "Process locally",
    icon: Cpu,
  },
  {
    key: "success",
    label: "Review transcript",
    icon: FileText,
  },
] as const;

const DETAIL_CARDS = [
  {
    title: "First run",
    copy: "The browser caches local model files after the first download.",
    icon: Sparkles,
  },
  {
    title: "Best results",
    copy: "Clear speech and lighter background noise produce cleaner transcripts.",
    icon: AudioLines,
  },
  {
    title: "Large uploads",
    copy: "Long videos stay private, but they still take time and memory to process locally.",
    icon: Video,
  },
];

export function TranscribbleApp() {
  const {
    accept,
    capabilityIssue,
    copied,
    currentFile,
    detail,
    dragActive,
    error,
    inputRef,
    isBusy,
    mediaProgress,
    message,
    onCopyTranscript,
    onDownloadTranscript,
    onDragLeave,
    onDragOver,
    onDrop,
    onFileInputChange,
    onReset,
    openFilePicker,
    partialTranscript,
    progress,
    progressItems,
    runtime,
    sessionSummary,
    stage,
    transcript,
  } = useTranscribble();

  const displayTranscript = useDeferredValue(transcript?.plainText ?? partialTranscript);
  const hasTranscript = displayTranscript.trim().length > 0;
  const isSuccess = stage === "success";
  const primaryFileIcon =
    currentFile?.name.toLowerCase().endsWith(".mp4") || currentFile?.name.toLowerCase().endsWith(".mov")
      ? Video
      : FileAudio;

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-600">
                <AudioLines className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900">{APP_NAME}</span>
            </div>
            <div className="hidden text-sm text-gray-500 sm:block">
              <span>Workspace</span> <span className="mx-1">/</span> <span>Local transcription</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden lg:block">
              <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                readOnly
                value={LOCAL_PROCESSING_NOTE}
                className="w-[360px] border-gray-200 bg-gray-50 pl-10 text-sm text-gray-600"
              />
            </div>
            <div className="flex h-10 min-w-10 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600">
              <Cpu className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{runtime === "webgpu" ? "WebGPU" : "WASM"}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">
        <aside className="border-b border-gray-200 bg-white lg:h-[calc(100vh-4rem)] lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="p-4">
            <div className="relative mb-6">
              <FileAudio className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                readOnly
                value={currentFile?.name ?? "Select media file"}
                onClick={openFilePicker}
                className="cursor-pointer border-gray-200 bg-gray-50 pl-10 text-sm text-gray-700"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={openFilePicker}
                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                disabled={isBusy}
              >
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>

            <nav className="space-y-1">
              {STEP_ITEMS.map((item) => {
                const isActive =
                  (item.key === "idle" && (stage === "idle" || stage === "preparing")) ||
                  (item.key === "transcribing" && (stage === "loading-model" || stage === "transcribing")) ||
                  (item.key === "success" && stage === "success");

                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.key === "idle" ? openFilePicker : undefined}
                    className={`flex w-full items-center justify-start rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? "bg-purple-50 text-purple-700 hover:bg-purple-100" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <item.icon className="mr-3 h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Supported</div>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_EXTENSIONS.map((extension) => (
                  <Badge key={extension} variant="secondary" className="bg-white text-gray-700">
                    {extension.slice(1).toUpperCase()}
                  </Badge>
                ))}
              </div>
              <div className="text-sm text-gray-600">Recommended max size: {MAX_FILE_SIZE_LABEL}</div>
            </div>
          </div>
        </aside>

        <main className="flex-1 bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1600px] space-y-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 sm:text-3xl">
                  Transcribe media privately, right in the browser.
                </h1>
                <p className="mt-2 max-w-3xl text-pretty text-sm text-gray-600 sm:text-base">
                  Drop an audio or video file and {APP_NAME} will decode, extract, and transcribe it locally. No paid API,
                  no server-side inference, and no extra setup once the model is cached.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={openFilePicker}
                  className="gap-2 bg-purple-600 hover:bg-purple-700"
                  disabled={isBusy}
                >
                  <HardDriveUpload className="h-4 w-4" />
                  Select file
                </Button>
                <Button variant="outline" onClick={onReset} className="gap-2 bg-transparent">
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard
                icon={ShieldCheck}
                title="On-device only"
                body="Transcription runs locally in the browser and keeps paid APIs out of the flow."
              />
              <InfoCard
                icon={Cpu}
                title="Smart runtime"
                body={
                  runtime === "webgpu"
                    ? "WebGPU acceleration is available for this browser."
                    : "Running with a WebAssembly fallback for broader compatibility."
                }
              />
              <InfoCard
                icon={primaryFileIcon}
                title="Accepted media"
                body="MP3, WAV, M4A, MP4, and MOV are supported in a single upload flow."
              />
              <InfoCard
                icon={FileText}
                title="Plain-text output"
                body="Copy it, download a `.txt`, or reset for the next transcript when you are done."
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
              <Card className="border-gray-200 shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-xl">Drop a file and start</CardTitle>
                      <CardDescription className="mt-1 text-sm">
                        First use downloads a local model. After that, transcripts stay in-browser and reuse cached assets.
                      </CardDescription>
                    </div>
                    {currentFile ? (
                      <Badge variant="secondary" className="w-fit bg-purple-100 text-purple-700">
                        {sessionSummary.fileMeta}
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <button
                    type="button"
                    onClick={openFilePicker}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    disabled={isBusy}
                    className={`group relative flex min-h-[260px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center transition-all duration-200 ${
                      dragActive
                        ? "border-purple-300 bg-purple-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/40 hover:shadow-md"
                    } ${isBusy ? "cursor-default" : "cursor-pointer"}`}
                  >
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 transition-transform duration-200 group-hover:scale-[1.03]">
                      <Grip className="h-6 w-6" />
                    </div>
                    <div className="space-y-2">
                      <div className="text-lg font-medium text-gray-900">
                        {currentFile ? currentFile.name : "Drag and drop media here"}
                      </div>
                      <div className="max-w-xl text-sm text-gray-600">
                        {currentFile
                          ? "The file stays on your device while the browser prepares and transcribes it."
                          : "Or click to browse for an audio or video file. Supported: mp3, mp4, m4a, wav, mov."}
                      </div>
                    </div>
                    {!currentFile ? (
                      <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {SUPPORTED_EXTENSIONS.map((extension) => (
                          <Badge key={extension} variant="secondary" className="bg-gray-100 text-gray-700">
                            {extension}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </button>

                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{message}</div>
                        <div className="mt-1 text-sm text-gray-600">{error ?? detail}</div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          error
                            ? "bg-red-100 text-red-700"
                            : isSuccess
                              ? "bg-green-100 text-green-700"
                              : "bg-purple-100 text-purple-700"
                        }
                      >
                        {error ? "Needs attention" : isSuccess ? "Finished" : "Working locally"}
                      </Badge>
                    </div>

                    <Progress value={error ? 100 : progress} className="h-2 bg-gray-200 [&>div]:bg-purple-600" />

                    {mediaProgress !== null ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Media prep</span>
                          <span>{Math.round(mediaProgress)}%</span>
                        </div>
                        <Progress value={mediaProgress} className="h-1.5 bg-gray-200 [&>div]:bg-gray-900" />
                      </div>
                    ) : null}

                    {progressItems.length > 0 ? (
                      <div className="space-y-2">
                        {progressItems.map((item) => (
                          <div key={item.file} className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span className="truncate pr-4">{item.file.split("/").at(-1) ?? item.file}</span>
                              <span>{item.progress.toFixed(0)}%</span>
                            </div>
                            <Progress value={item.progress} className="h-1.5 bg-gray-200 [&>div]:bg-purple-600" />
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {error ? (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{error}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="border-gray-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Session</CardTitle>
                    <CardDescription>Current file, runtime, and output details.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <SessionRow label="File" value={sessionSummary.fileMeta} />
                    <SessionRow label="Duration" value={sessionSummary.durationLabel} />
                    <SessionRow label="Runtime" value={sessionSummary.runtimeLabel} />
                    <SessionRow label="Model" value={sessionSummary.modelLabel} />
                    <SessionRow label="Size" value={sessionSummary.fileSizeLabel} />
                    <SessionRow
                      label="Output"
                      value={
                        transcript
                          ? `${transcript.wordCount} words · ${transcript.characterCount} characters`
                          : "Transcript will appear here"
                      }
                    />
                  </CardContent>
                </Card>

                <Card className="border-gray-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Local notes</CardTitle>
                    <CardDescription>Short, practical guidance for local transcription.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-gray-600">
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      {capabilityIssue ?? LOCAL_PROCESSING_NOTE}
                    </div>
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      Recent Chrome or Edge builds usually offer the smoothest WebGPU path. Other browsers fall back
                      gracefully when possible.
                    </div>
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      Very large videos can still hit browser memory limits because audio extraction and inference both
                      happen locally.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-xl">Transcript</CardTitle>
                    <CardDescription className="mt-1">
                      {hasTranscript
                        ? "Readable plain text with line breaks for easy scanning and export."
                        : "When transcription completes, the browser will render the result here."}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={onCopyTranscript}
                      disabled={!transcript}
                      className="gap-2 bg-transparent"
                    >
                      <Copy className="h-4 w-4" />
                      {copied ? "Copied" : "Copy transcript"}
                    </Button>
                    <Button
                      onClick={onDownloadTranscript}
                      disabled={!transcript}
                      className="gap-2 bg-purple-600 hover:bg-purple-700"
                    >
                      <Download className="h-4 w-4" />
                      Download .txt
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="min-h-[320px] rounded-lg border border-gray-200 bg-gray-50 p-5">
                  {hasTranscript ? (
                    <div className="space-y-4">
                      {transcript ? (
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="bg-white text-gray-700">
                            {transcript.wordCount} words
                          </Badge>
                          <Badge variant="secondary" className="bg-white text-gray-700">
                            {transcript.characterCount} characters
                          </Badge>
                          <Badge variant="secondary" className="bg-white text-gray-700">
                            {formatDuration(transcript.duration)}
                          </Badge>
                        </div>
                      ) : null}
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-gray-800">
                        {displayTranscript}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-purple-700 shadow-sm">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="text-lg font-medium text-gray-900">No transcript yet</div>
                      <div className="mt-2 max-w-xl text-sm text-gray-600">
                        Upload a file to generate a local transcript with copy, download, and reset controls when it
                        finishes.
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {DETAIL_CARDS.map((card) => (
                <Card key={card.title} className="border-gray-200 shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                      <card.icon className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="font-medium text-gray-900">{card.title}</div>
                    <div className="mt-2 text-sm text-gray-600">{card.copy}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </main>
      </div>

      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onFileInputChange} />
    </div>
  );
}

function InfoCard({
  body,
  icon: Icon,
  title,
}: {
  body: string;
  icon: typeof ShieldCheck;
  title: string;
}) {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Icon className="h-5 w-5 text-gray-600" />
          </div>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        </div>
        <div className="text-base font-medium text-gray-900">{title}</div>
        <div className="mt-2 text-sm text-gray-600">{body}</div>
      </CardContent>
    </Card>
  );
}

function SessionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[70%] text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}
