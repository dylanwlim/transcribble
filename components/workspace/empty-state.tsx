"use client";

import { Download, ShieldCheck, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  onImport: () => void;
  onPrimeSetup: () => void | Promise<void>;
  setupReady: boolean;
  warming: boolean;
  online: boolean;
  supportedFormatsLabel: string;
}

export function EmptyState({
  onImport,
  onPrimeSetup,
  setupReady,
  warming,
  online,
  supportedFormatsLabel,
}: EmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-foreground">
            <rect x="3" y="9" width="2" height="6" rx="1" />
            <rect x="7" y="5" width="2" height="14" rx="1" />
            <rect x="11" y="8" width="2" height="8" rx="1" />
            <rect x="15" y="3" width="2" height="18" rx="1" />
            <rect x="19" y="7" width="2" height="10" rx="1" />
          </svg>
        </div>
        <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
          Your local voice workspace
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-6 text-muted-foreground">
          Bring in audio or video. Transcribble transcribes it on this device and
          keeps everything here — searchable, editable, and exportable.
        </p>

        <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onImport}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-[13px] font-medium text-background",
              "transition-transform duration-150 motion-safe:hover:-translate-y-px ring-focus",
            )}
          >
            <Upload className="h-3.5 w-3.5" />
            Add a recording
            <span className="ml-1 rounded border border-background/30 px-1 text-[10px] mono">
              ⌘O
            </span>
          </button>

          {!setupReady ? (
            <button
              type="button"
              onClick={() => void onPrimeSetup()}
              disabled={warming || !online}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-[13px] font-medium text-foreground",
                "transition-colors duration-150 hover:bg-muted disabled:opacity-50 ring-focus",
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {warming ? "Getting ready…" : online ? "Get this browser ready" : "Go online once"}
            </button>
          ) : null}
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 text-[11px] text-subtle">
          <span>Drop files anywhere</span>
          <span className="h-0.5 w-0.5 rounded-full bg-border-strong" />
          <span>{supportedFormatsLabel}</span>
          <span className="h-0.5 w-0.5 rounded-full bg-border-strong" />
          <span>Stays on this device</span>
        </div>
      </div>
    </div>
  );
}

export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
        "animate-fade-in",
      )}
    >
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/60 bg-surface px-10 py-8 shadow-[var(--shadow-float)]">
        <Download className="h-5 w-5 text-primary" />
        <div className="text-[14px] font-medium text-foreground">Drop to import</div>
        <div className="text-[11px] text-muted-foreground">
          Files stay on this device.
        </div>
      </div>
    </div>
  );
}
