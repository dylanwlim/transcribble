"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/transcribble/transcript";
import type {
  SavedRange,
  TranscriptMark,
  TranscriptSegment,
} from "@/lib/transcribble/types";

interface WaveformProps {
  mediaUrl: string | null;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  segments: TranscriptSegment[];
  marks: TranscriptMark[];
  ranges: SavedRange[];
  envelope?: number[];
  recording?: boolean;
  onSeek: (time: number, autoplay?: boolean) => void;
  onBookmarkClick?: (segmentId: string) => void;
  disabled?: boolean;
}

const BAR_WIDTH = 3;
const BAR_GAP = 2;

interface ThemeColors {
  foreground: string;
  subtle: string;
  primary: string;
  recordColor: string;
  border: string;
}

const FALLBACK_THEME: ThemeColors = {
  foreground: "222 14% 10%",
  subtle: "225 6% 58%",
  primary: "222 88% 55%",
  recordColor: "358 80% 56%",
  border: "225 14% 89%",
};

function readThemeColors(): ThemeColors {
  if (typeof window === "undefined") return FALLBACK_THEME;
  const styles = getComputedStyle(document.documentElement);
  return {
    foreground: styles.getPropertyValue("--foreground").trim() || FALLBACK_THEME.foreground,
    subtle: styles.getPropertyValue("--subtle").trim() || FALLBACK_THEME.subtle,
    primary: styles.getPropertyValue("--primary").trim() || FALLBACK_THEME.primary,
    recordColor: styles.getPropertyValue("--record").trim() || FALLBACK_THEME.recordColor,
    border: styles.getPropertyValue("--border").trim() || FALLBACK_THEME.border,
  };
}

function hashSeed(input: string) {
  let seed = 0;
  for (let i = 0; i < input.length; i += 1) {
    seed = (seed * 31 + input.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(seed) || 1;
}

function pseudoRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function buildEnvelope(
  segments: TranscriptSegment[],
  duration: number,
  bars: number,
) {
  if (bars <= 0) return [] as number[];

  const total = Math.max(duration, 1);
  const envelope = new Float32Array(bars);
  const segmentRand = pseudoRandom(
    segments.length ? hashSeed(segments[0].id + ":" + segments.length) : 7,
  );

  // Base shimmer so even without segments we get a subtle field
  for (let i = 0; i < bars; i += 1) {
    envelope[i] = 0.14 + segmentRand() * 0.06;
  }

  for (const segment of segments) {
    const startBar = Math.floor((segment.start / total) * bars);
    const endBar = Math.min(bars, Math.ceil((segment.end / total) * bars));
    const density = Math.min(
      1,
      segment.wordCount / Math.max(1, (segment.end - segment.start) * 3.2),
    );
    const baseHeight = 0.35 + density * 0.55;
    const rand = pseudoRandom(hashSeed(segment.id));

    for (let i = startBar; i < endBar; i += 1) {
      // sinusoidal breath inside segment gives it character
      const t = endBar === startBar ? 0 : (i - startBar) / (endBar - startBar);
      const breath = Math.sin(t * Math.PI);
      const jitter = rand() * 0.28;
      envelope[i] = Math.max(
        envelope[i],
        Math.min(1, baseHeight * (0.55 + breath * 0.55) + jitter),
      );
    }
  }

  return Array.from(envelope);
}

function resampleEnvelope(source: number[], bars: number): number[] {
  if (bars <= 0 || source.length === 0) return [];
  const out = new Array<number>(bars);
  const ratio = source.length / bars;
  for (let i = 0; i < bars; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let max = 0;
    for (let j = start; j < end && j < source.length; j += 1) {
      const v = source[j];
      if (v > max) max = v;
    }
    out[i] = Math.max(0.06, Math.min(1, max));
  }
  return out;
}

export function Waveform({
  mediaUrl,
  duration,
  currentTime,
  isPlaying,
  segments,
  marks,
  ranges,
  envelope: sourceEnvelope,
  recording,
  onSeek,
  onBookmarkClick,
  disabled,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(640);
  const [height, setHeight] = useState(96);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setWidth(Math.max(120, Math.floor(rect.width)));
      setHeight(Math.max(64, Math.floor(rect.height)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [themeColors, setThemeColors] = useState(() => readThemeColors());
  useEffect(() => {
    if (typeof window === "undefined") return;
    setThemeColors(readThemeColors());
    const observer = new MutationObserver(() => setThemeColors(readThemeColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  const totalBars = Math.max(16, Math.floor(width / (BAR_WIDTH + BAR_GAP)));

  const envelope = useMemo(
    () =>
      sourceEnvelope && sourceEnvelope.length > 0
        ? resampleEnvelope(sourceEnvelope, totalBars)
        : buildEnvelope(segments, duration, totalBars),
    [sourceEnvelope, segments, duration, totalBars],
  );

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

    const mid = height / 2;
    const effectiveBars = envelope.length;
    const barSlot = (BAR_WIDTH + BAR_GAP);
    const totalLength = effectiveBars * barSlot;
    const offsetX = (width - totalLength) / 2;
    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

    const { foreground, subtle, primary, recordColor, border } = themeColors;

    for (let i = 0; i < effectiveBars; i += 1) {
      const v = envelope[i];
      const x = offsetX + i * barSlot;
      const t = i / (effectiveBars - 1 || 1);
      const passed = t <= progress;
      const barHeight = Math.max(2, v * (height - 8));
      const y = mid - barHeight / 2;
      ctx.fillStyle = recording
        ? `hsl(${recordColor} / ${passed ? 0.95 : 0.7})`
        : passed
          ? `hsl(${foreground})`
          : `hsl(${subtle} / 0.55)`;
      ctx.fillRect(x, y, BAR_WIDTH, barHeight);
    }

    // Saved-range shading
    if (duration > 0) {
      for (const range of ranges) {
        const xStart = offsetX + (range.start / duration) * totalLength;
        const xEnd = offsetX + (range.end / duration) * totalLength;
        ctx.fillStyle = `hsl(${primary} / 0.07)`;
        ctx.fillRect(xStart, 4, Math.max(2, xEnd - xStart), height - 8);
        ctx.fillStyle = `hsl(${primary} / 0.6)`;
        ctx.fillRect(xStart, height - 3, Math.max(2, xEnd - xStart), 2);
      }
    }

    // Playhead
    if (!recording && duration > 0) {
      const playheadX = offsetX + progress * totalLength;
      ctx.fillStyle = `hsl(${foreground})`;
      ctx.fillRect(playheadX - 1, 0, 2, height);
      // Head dot
      ctx.beginPath();
      ctx.arc(playheadX, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Recording pulse at current "edge"
    if (recording) {
      const edge = offsetX + totalLength;
      ctx.fillStyle = `hsl(${recordColor})`;
      ctx.beginPath();
      ctx.arc(edge + 2, mid, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hover guide
    if (hoverX !== null) {
      ctx.fillStyle = `hsl(${border})`;
      ctx.fillRect(hoverX - 0.5, 0, 1, height);
    }
  }, [
    envelope,
    width,
    height,
    currentTime,
    duration,
    ranges,
    recording,
    hoverX,
    themeColors,
  ]);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const element = containerRef.current;
      if (!element || duration <= 0) return 0;
      const rect = element.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = event.clientX - rect.left;
    setHoverX(x);
    setHoverTime(timeFromClientX(event.clientX));
  };

  const onPointerLeave = () => {
    setHoverX(null);
    setHoverTime(null);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0 || !mediaUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSeek(timeFromClientX(event.clientX));
  };

  const onPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0 || !mediaUrl) return;
    if (event.buttons !== 1) return;
    onSeek(timeFromClientX(event.clientX));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return;
    const step = event.shiftKey ? 5 : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onSeek(Math.max(0, currentTime - step));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onSeek(Math.min(duration, currentTime + step));
    }
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Scrub recording"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime || 0}
      aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(duration)}`}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        onPointerMove(event);
        onPointerDrag(event);
      }}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative h-16 w-full select-none overflow-hidden rounded-md border border-border bg-surface/50",
        disabled ? "cursor-default opacity-60" : "cursor-pointer",
        "ring-focus",
        recording && "cursor-default",
      )}
    >
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none block" />

      {/* Bookmark markers */}
      {duration > 0
        ? marks.map((mark) => {
            const segment = segments.find((s) => s.id === mark.segmentId);
            if (!segment) return null;
            const left = Math.min(1, segment.start / duration) * 100;
            const tone =
              mark.kind === "bookmark"
                ? "bg-primary"
                : mark.color === "amber"
                  ? "bg-warning"
                  : mark.color === "rose"
                    ? "bg-record"
                    : "bg-primary";
            return (
              <button
                key={mark.id}
                type="button"
                aria-label={mark.label}
                onClick={(event) => {
                  event.stopPropagation();
                  onBookmarkClick?.(mark.segmentId);
                }}
                className={cn(
                  "absolute top-0 flex h-3 w-3 -translate-x-1/2 items-start justify-center",
                  "ring-focus",
                )}
                style={{ left: `${left}%` }}
              >
                <span className={cn("h-2 w-2 rounded-full", tone)} />
              </button>
            );
          })
        : null}

      {/* Hover timestamp */}
      {hoverTime !== null && hoverX !== null && !disabled ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background mono"
          style={{ left: hoverX }}
        >
          {formatDuration(hoverTime)}
        </div>
      ) : null}

      {isPlaying ? (
        <div className="pointer-events-none absolute inset-0 animate-fade-in" />
      ) : null}
    </div>
  );
}
