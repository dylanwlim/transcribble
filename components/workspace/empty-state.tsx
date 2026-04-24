"use client";

import { Download, MonitorUp, ShieldCheck, Upload } from "lucide-react";
import React from "react";

import {
  ADD_RECORDING_LABEL,
  EMPTY_STATE_COPY,
} from "@/lib/transcribble/constants";
import { cn } from "@/lib/utils";
import { KeyboardShortcut } from "./keyboard-shortcut";

interface EmptyStateProps {
  onImport: () => void;
  onPrimeSetup: () => void | Promise<void>;
  onOpenSettings: () => void;
  setupReady: boolean;
  warming: boolean;
  online: boolean;
  helperAvailable: boolean;
  desktopAppInstalled: boolean;
  desktopInstallAvailable: boolean;
  onOpenDesktopApp: () => void | Promise<void>;
  supportedFormats: string[];
}

export function EmptyState({
  onImport,
  onPrimeSetup,
  onOpenSettings,
  setupReady,
  warming,
  online,
  helperAvailable,
  desktopAppInstalled,
  desktopInstallAvailable,
  onOpenDesktopApp,
  supportedFormats,
}: EmptyStateProps) {
  const supportedFormatsSummary =
    supportedFormats.length > 4
      ? `${supportedFormats.slice(0, 4).join(", ")}, and more`
      : supportedFormats.join(", ");

  return (
    <div className="workspace-empty-shell grid min-h-0 w-full flex-1 place-items-center px-[var(--workspace-mobile-padding)] py-10 sm:py-12 lg:px-10">
      <div className="workspace-empty-hero mx-auto flex w-full max-w-[var(--workspace-hero-max-width)] flex-col items-center text-center">
        <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-full bg-muted">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-foreground">
            <rect x="3" y="9" width="2" height="6" rx="1" />
            <rect x="7" y="5" width="2" height="14" rx="1" />
            <rect x="11" y="8" width="2" height="8" rx="1" />
            <rect x="15" y="3" width="2" height="18" rx="1" />
            <rect x="19" y="7" width="2" height="10" rx="1" />
          </svg>
        </div>
        <h1 className="text-balance text-[clamp(1.75rem,4vw,2.35rem)] font-semibold tracking-tight text-foreground">
          Your local voice workspace
        </h1>
        <p className="mx-auto mt-3 max-w-[38rem] text-pretty text-[14px] leading-6 text-muted-foreground sm:text-[15px]">
          {EMPTY_STATE_COPY}
        </p>

        <div className="workspace-empty-actions mt-7 w-full gap-2.5">
          <button
            type="button"
            onClick={onImport}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2 text-[13px] font-medium text-background",
              "whitespace-nowrap",
              "transition-transform duration-150 motion-safe:hover:-translate-y-px ring-focus",
            )}
          >
            <Upload className="h-3.5 w-3.5" />
            {ADD_RECORDING_LABEL}
            <KeyboardShortcut
              shortcutId="add-recording"
              className="workspace-empty-shortcut ml-1"
              keyClassName="border-background/30 bg-background/10 text-background/85"
            />
          </button>

          <button
            type="button"
            onClick={() => void onOpenDesktopApp()}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-2 text-[13px] font-medium text-foreground",
              "whitespace-nowrap transition-colors duration-150 hover:bg-muted ring-focus",
            )}
          >
            <MonitorUp className="h-3.5 w-3.5" />
            {desktopAppInstalled
              ? "Open app"
              : desktopInstallAvailable
                ? "Install app"
                : "Desktop app"}
          </button>

          {!setupReady ? (
            <button
              type="button"
              onClick={() => void onPrimeSetup()}
              disabled={warming || !online}
              className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-2 text-[13px] font-medium text-foreground",
              "whitespace-nowrap",
              "transition-colors duration-150 hover:bg-muted disabled:opacity-50 ring-focus",
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
              {warming ? "Getting ready…" : online ? "Prepare browser" : "Go online once"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onOpenSettings}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-2 text-[13px] font-medium text-foreground",
              "whitespace-nowrap transition-colors duration-150 hover:bg-muted ring-focus",
            )}
          >
            {helperAvailable ? "Local accelerator ready" : "Check local accelerator"}
          </button>
        </div>

        <div className="workspace-empty-meta mt-7 gap-x-4 gap-y-2 text-[11px] leading-5 text-muted-foreground sm:text-[12px]">
          <div className="workspace-empty-meta-group">Drop files anywhere</div>
          <div className="workspace-empty-meta-group inline-flex items-center justify-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-subtle" aria-hidden />
            <span>Stays on this device</span>
          </div>
          <div className="workspace-empty-meta-group">
            {helperAvailable
              ? "Long recordings chunk locally"
              : "Long recordings need the local accelerator"}
          </div>
        </div>

        <div
          className="mt-3 text-[11px] leading-5 text-muted-foreground sm:text-[12px]"
          aria-label={`Supported formats: ${supportedFormats.join(", ")}`}
        >
          Supports {supportedFormatsSummary}.
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
