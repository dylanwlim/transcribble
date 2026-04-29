"use client";

import {
  Copy,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Square,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import React from "react";

import { cn } from "@/lib/utils";
import {
  buildLiveTranscriptText,
  formatRecordingTimer,
  formatRecordingTitle,
  LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE,
  type RecordingViewState,
} from "@/lib/transcribble/recording";
import { formatDuration } from "@/lib/transcribble/transcript";

interface RecordingConsoleProps {
  recording: RecordingViewState;
  onStart: () => void;
  onStop: () => void;
  onSave: () => void | Promise<void>;
  onImport: () => void;
  onOpenSettings: () => void;
}

const WAVEFORM_WINDOW_SECONDS = 10;

export function RecordingConsole({
  recording,
  onStart,
  onStop,
  onSave,
  onImport,
  onOpenSettings,
}: RecordingConsoleProps) {
  const active =
    recording.status === "requesting-permission" ||
    recording.status === "recording" ||
    recording.status === "stopping";
  const busy =
    recording.status === "requesting-permission" ||
    recording.status === "stopping" ||
    recording.status === "saving";
  const canRetrySave = recording.status === "error" && recording.canRetrySave;
  const liveText = buildLiveTranscriptText(
    recording.liveFinalTranscript,
    recording.liveInterimTranscript,
  );
  const showTranscript =
    recording.status !== "idle" ||
    Boolean(recording.liveFinalTranscript.trim()) ||
    Boolean(recording.liveInterimTranscript.trim());
  const startedAt = recording.startedAt ? new Date(recording.startedAt) : null;
  const title = startedAt ? formatRecordingTitle(startedAt) : "New recording";
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const canPreview = Boolean(recording.previewUrl) && !active;

  useEffect(() => {
    setPreviewPlaying(false);
    setPreviewTime(0);
  }, [recording.previewUrl]);

  const handlePrimary = () => {
    if (active) {
      onStop();
      return;
    }

    if (canRetrySave) {
      void onSave();
      return;
    }

    onStart();
  };

  const togglePreview = () => {
    const media = previewRef.current;
    if (!media) return;

    if (media.paused) {
      void media.play();
    } else {
      media.pause();
    }
  };

  const seekPreviewBy = (deltaSeconds: number) => {
    const media = previewRef.current;
    if (!media) return;
    const duration = Number.isFinite(media.duration) ? media.duration : recording.elapsedMs / 1000;
    media.currentTime = Math.max(0, Math.min(duration, media.currentTime + deltaSeconds));
    setPreviewTime(media.currentTime);
  };

  const primaryLabel = active
    ? recording.status === "requesting-permission"
      ? "Requesting microphone"
      : "Stop recording"
    : canRetrySave
      ? "Save recording"
      : "Start recording";

  const saveLabel =
    recording.status === "saving"
      ? "Saving"
      : recording.status === "transcribing"
        ? "Saved"
        : recording.status === "saved"
          ? "Saved"
          : canRetrySave
            ? "Save"
            : "Save";

  return (
    <section className="w-full" aria-labelledby="recording-console-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">
            Record
          </div>
          <h1
            id="recording-console-title"
            className="mt-2 text-[clamp(1.65rem,3vw,2.25rem)] font-semibold leading-tight tracking-normal text-foreground"
          >
            New recording
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Start a new recording</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handlePrimary}
            disabled={busy && !active}
            aria-label={primaryLabel}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full bg-record px-4 text-[12px] font-semibold text-white shadow-[var(--shadow-soft)]",
              "transition-transform duration-150 motion-safe:hover:-translate-y-px ring-focus disabled:cursor-wait disabled:opacity-80",
            )}
          >
            {busy && recording.status !== "recording" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : active ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white" />
            )}
            {primaryLabel}
          </button>

          <button
            type="button"
            onClick={onImport}
            aria-label="Add recording"
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[12px] font-semibold text-background",
              "shadow-[var(--shadow-soft)] transition-transform duration-150 motion-safe:hover:-translate-y-px ring-focus",
            )}
          >
            <Upload className="h-3.5 w-3.5" />
            Add recording
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-[22px] border border-border bg-surface/90 px-5 pb-5 pt-6 shadow-[0_1px_2px_rgba(16,20,28,0.03)] sm:px-7 sm:pb-6 sm:pt-7">
        {recording.previewUrl ? (
          <audio
            ref={previewRef}
            src={recording.previewUrl}
            preload="metadata"
            onPlay={() => setPreviewPlaying(true)}
            onPause={() => setPreviewPlaying(false)}
            onEnded={() => setPreviewPlaying(false)}
            onTimeUpdate={(event) => setPreviewTime(event.currentTarget.currentTime)}
            className="hidden"
          />
        ) : null}
        <RecordingWaveform
          samples={recording.liveEnvelope}
          elapsedMs={recording.elapsedMs}
          active={active}
          fallbackPulse={recording.status === "recording" && recording.liveEnvelope.length === 0}
        />

        <div className="mt-5 text-center text-[34px] font-semibold leading-none tracking-normal text-foreground tabular sm:text-[40px]">
          {canPreview && previewTime > 0
            ? formatRecordingTimer(previewTime * 1000)
            : formatRecordingTimer(recording.elapsedMs)}
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={active ? onStop : handlePrimary}
              disabled={recording.status === "saving"}
              aria-label={active ? "Stop recording" : "Start recording"}
              className={cn(
                "inline-flex h-12 min-w-28 items-center justify-center rounded-full border border-border bg-surface text-record shadow-[var(--shadow-soft)]",
                "transition-colors duration-150 hover:bg-record-soft ring-focus disabled:cursor-wait disabled:opacity-60",
              )}
            >
              {active ? <Square className="h-4 w-4 fill-current" /> : <span className="h-5 w-5 rounded-full bg-record" />}
            </button>
          </div>

          {canPreview ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface/80 px-2 py-1">
              <ConsoleButton label="Back 15 seconds" onClick={() => seekPreviewBy(-15)}>
                <SkipGlyph direction="back" />
              </ConsoleButton>
              <ConsoleButton
                label={previewPlaying ? "Pause recording preview" : "Play recording preview"}
                onClick={togglePreview}
              >
                {previewPlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                )}
              </ConsoleButton>
              <ConsoleButton label="Forward 15 seconds" onClick={() => seekPreviewBy(15)}>
                <SkipGlyph direction="forward" />
              </ConsoleButton>
            </div>
          ) : (
            <div aria-hidden className="h-11" />
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={canRetrySave ? () => void onSave() : undefined}
              disabled={!canRetrySave}
              aria-label={canRetrySave ? "Save recording" : saveLabel}
              className={cn(
                "inline-flex h-11 min-w-20 items-center justify-center rounded-full px-4 text-[12px] font-semibold",
                recording.status === "saved" || recording.status === "transcribing"
                  ? "bg-foreground text-background"
                  : "bg-muted text-subtle",
                canRetrySave && "bg-foreground text-background hover:opacity-90 ring-focus",
                !canRetrySave && "cursor-default",
              )}
            >
              {saveLabel}
            </button>
          </div>
        </div>
      </div>

      {recording.error ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] leading-5 text-foreground"
        >
          {recording.error}
        </div>
      ) : null}

      {showTranscript ? (
        <LiveTranscriptSection
          title={title}
          startedAt={startedAt}
          elapsedMs={recording.elapsedMs}
          finalText={recording.liveFinalTranscript}
          interimText={recording.liveInterimTranscript}
          liveText={liveText}
          listening={recording.status === "recording" && recording.liveSpeechRecognitionActive}
          notice={recording.notice}
          liveSupported={recording.liveSpeechRecognitionSupported}
          onOpenSettings={onOpenSettings}
        />
      ) : null}
    </section>
  );
}

function RecordingWaveform({
  samples,
  elapsedMs,
  active,
  fallbackPulse,
}: {
  samples: number[];
  elapsedMs: number;
  active: boolean;
  fallbackPulse: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(900);
  const [height, setHeight] = useState(210);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
      setHeight(Math.max(160, Math.floor(entry.contentRect.height)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!fallbackPulse) return;
    let frame = 0;
    const tick = () => {
      setPulse((previous) => (previous + 0.08) % (Math.PI * 2));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [fallbackPulse]);

  const marks = useMemo(() => {
    const elapsedSeconds = elapsedMs / 1000;
    const start = Math.max(0, Math.floor(Math.max(0, elapsedSeconds - WAVEFORM_WINDOW_SECONDS) / 2) * 2);
    return [0, 2, 4, 6, 8, 10].map((offset) => start + offset);
  }, [elapsedMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const record = styles.getPropertyValue("--record").trim() || "358 80% 56%";
    const subtle = styles.getPropertyValue("--subtle").trim() || "0 0% 49%";
    const mid = Math.floor(height * 0.45);
    const graphTop = 16;
    const graphHeight = Math.max(70, height * 0.44);
    const left = 20;
    const right = width - 20;
    const graphWidth = right - left;
    const playheadX = left + graphWidth * 0.66;
    const maxBars = Math.max(72, Math.floor(graphWidth / 4));
    const visibleSamples = samples.length > maxBars ? samples.slice(samples.length - maxBars) : samples;
    const paddedSamples =
      visibleSamples.length > 0
        ? visibleSamples
        : fallbackPulse
          ? Array.from({ length: maxBars }, (_, index) => 0.05 + Math.sin(index * 0.35 + pulse) ** 2 * 0.08)
          : Array.from({ length: maxBars }, () => 0.03);
    const barGap = graphWidth / Math.max(1, paddedSamples.length - 1);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `hsl(${record} / ${active ? 0.85 : 0.45})`;
    ctx.beginPath();
    ctx.moveTo(left, mid);
    ctx.lineTo(right, mid);
    ctx.stroke();

    ctx.fillStyle = `hsl(${record} / ${active ? 0.9 : 0.55})`;
    paddedSamples.forEach((sample, index) => {
      const x = left + index * barGap;
      const heightScale = Math.max(2, sample * graphHeight);
      const y = mid - heightScale / 2;
      ctx.fillRect(x, y, 2, heightScale);
    });

    ctx.fillStyle = `hsl(${record} / ${active ? 0.86 : 0.5})`;
    ctx.fillRect(playheadX - 1, graphTop, 2, graphHeight + 34);

    ctx.fillStyle = `hsl(${subtle} / 0.7)`;
    ctx.font = "500 13px var(--font-sans), sans-serif";
    marks.forEach((mark, index) => {
      const x = left + (index / (marks.length - 1)) * graphWidth;
      ctx.textAlign = index === 0 ? "left" : index === marks.length - 1 ? "right" : "center";
      ctx.fillText(formatDuration(mark), x, height - 22);
    });
  }, [active, elapsedMs, fallbackPulse, height, marks, pulse, samples, width]);

  return (
    <div
      ref={wrapperRef}
      className="h-[240px] w-full overflow-hidden rounded-[18px] bg-[hsl(var(--surface))] sm:h-[260px]"
    >
      <canvas ref={canvasRef} aria-hidden className="block" />
    </div>
  );
}

function LiveTranscriptSection({
  title,
  startedAt,
  elapsedMs,
  finalText,
  interimText,
  liveText,
  listening,
  notice,
  liveSupported,
  onOpenSettings,
}: {
  title: string;
  startedAt: Date | null;
  elapsedMs: number;
  finalText: string;
  interimText: string;
  liveText: string;
  listening: boolean;
  notice: string | null;
  liveSupported: boolean;
  onOpenSettings: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const paragraphs = finalText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const onCopy = async () => {
    if (!liveText || !navigator.clipboard) return;
    await navigator.clipboard.writeText(liveText).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="mt-10 animate-rise-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-subtle">
            Recording
          </div>
          <h2 className="mt-2 text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-tight tracking-normal text-foreground">
            {title}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground tabular">
            {startedAt ? (
              <span>
                {startedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            ) : null}
            {startedAt ? <span className="text-border-strong">·</span> : null}
            <span>{formatDuration(elapsedMs / 1000)}</span>
          </div>
        </div>

        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open recording settings"
            className="inline-flex h-9 w-9 items-center justify-center text-subtle hover:bg-muted hover:text-foreground ring-focus"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={!liveText}
            aria-label="Copy live transcript"
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center border-l border-border text-subtle hover:bg-muted hover:text-foreground ring-focus disabled:opacity-35",
              copied && "text-primary",
            )}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-6 max-w-5xl text-[15px] font-medium leading-8 text-foreground/85">
        {paragraphs.map((paragraph, index) => (
          <p key={`${paragraph.slice(0, 24)}-${index}`} className="mb-5">
            {paragraph}
          </p>
        ))}
        {interimText.trim() ? (
          <p className="mb-5 text-muted-foreground/75">{interimText.trim()}</p>
        ) : null}
        {listening ? (
          <div className="mt-1 flex items-center gap-1.5" aria-label="Listening">
            <span className="h-1.5 w-1.5 rounded-full bg-record/35 animate-pulse-record" />
            <span className="h-1.5 w-1.5 rounded-full bg-record/45 animate-pulse-record [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-record/55 animate-pulse-record [animation-delay:240ms]" />
          </div>
        ) : null}
        {notice ? (
          <p className="mt-4 max-w-2xl text-[12px] font-medium leading-5 text-muted-foreground">
            {notice}
          </p>
        ) : null}
        {!liveSupported && notice !== LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE ? (
          <p className="mt-4 max-w-2xl text-[12px] font-medium leading-5 text-muted-foreground">
            {LIVE_TRANSCRIPT_UNAVAILABLE_NOTICE}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ConsoleButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-subtle ring-focus hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function SkipGlyph({ direction }: { direction: "back" | "forward" }) {
  const Icon = direction === "back" ? RotateCcw : RotateCw;
  return (
    <span className="relative inline-flex h-5 w-5 items-center justify-center">
      <Icon className="h-5 w-5" />
      <span className="absolute text-[7px] font-semibold leading-none">15</span>
    </span>
  );
}
