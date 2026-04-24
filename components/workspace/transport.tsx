"use client";

import {
  Bookmark,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/transcribble/transcript";

interface TransportProps {
  isPlaying: boolean;
  disabled?: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onPlayPause: () => void;
  onSkip: (delta: number) => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
  onChangeRate: (rate: number) => void;
  onToggleBookmark: () => void;
  bookmarkActive?: boolean;
}

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

export function Transport({
  isPlaying,
  disabled,
  currentTime,
  duration,
  playbackRate,
  onPlayPause,
  onSkip,
  onPrevSegment,
  onNextSegment,
  onChangeRate,
  onToggleBookmark,
  bookmarkActive,
}: TransportProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <div className="text-[32px] font-semibold leading-none tracking-normal text-foreground tabular sm:text-[36px]">
        {formatDuration(currentTime)}
      </div>

      <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-2 py-1">
        <TransportButton
          label="Previous segment"
          shortcut="K"
          onClick={onPrevSegment}
          disabled={disabled}
        >
          <SkipBack className="h-3.5 w-3.5" />
        </TransportButton>
        <TransportButton
          label="Back 15 seconds"
          onClick={() => onSkip(-15)}
          disabled={disabled}
        >
          <SkipGlyph direction="back" />
        </TransportButton>

        <button
          type="button"
          onClick={onPlayPause}
          disabled={disabled}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={cn(
            "mx-0.5 flex h-10 w-10 items-center justify-center rounded-full",
            "bg-foreground text-background shadow-[var(--shadow-soft)] transition-transform duration-150",
            "motion-safe:hover:scale-[1.04] motion-safe:active:scale-[0.98] ring-focus",
            "disabled:opacity-40 disabled:hover:scale-100",
          )}
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>

        <TransportButton
          label="Forward 15 seconds"
          onClick={() => onSkip(15)}
          disabled={disabled}
        >
          <SkipGlyph direction="forward" />
        </TransportButton>
        <TransportButton
          label="Next segment"
          shortcut="J"
          onClick={onNextSegment}
          disabled={disabled}
        >
          <SkipForward className="h-3.5 w-3.5" />
        </TransportButton>
      </div>

      <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
        <span className="tabular">{formatDuration(duration)}</span>
        <button
          type="button"
          onClick={onToggleBookmark}
          disabled={disabled}
          aria-label="Toggle bookmark"
          title="Toggle bookmark (B)"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-subtle transition-colors duration-150",
            "hover:bg-muted hover:text-foreground ring-focus disabled:opacity-40",
            bookmarkActive && "text-primary",
          )}
        >
          <Bookmark className={cn("h-3.5 w-3.5", bookmarkActive && "fill-current")} />
        </button>

        <div className="relative">
          <select
            value={playbackRate}
            onChange={(event) => onChangeRate(Number(event.target.value))}
            disabled={disabled}
            aria-label="Playback speed"
            className={cn(
              "h-8 cursor-pointer appearance-none rounded-full bg-muted/60 pl-3 pr-6 text-[12px] tabular text-foreground",
              "ring-focus disabled:opacity-40",
            )}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-subtle">
            ▾
          </span>
        </div>
      </div>
    </div>
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

function TransportButton({
  children,
  label,
  shortcut,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full text-subtle transition-colors duration-150",
        "hover:bg-muted hover:text-foreground ring-focus disabled:opacity-40 disabled:hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}
