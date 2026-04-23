"use client";

import {
  Check,
  ChevronRight,
  Download,
  Loader2,
  RotateCcw,
  Shield,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import React, { useEffect, useId, useRef } from "react";

import {
  IMPORT_FILE_LABEL,
  LOCAL_ACCELERATOR_CHECK_COMMAND,
  LOCAL_ACCELERATOR_INSTALL_COMMAND,
  LOCAL_ACCELERATOR_START_COMMAND,
  SETTINGS_MODAL_TITLE,
  SETTINGS_PRIVACY_COPY,
  SETTINGS_SECTION_LABEL,
} from "@/lib/transcribble/constants";
import type { HelperModelProfile, LocalHelperModelAvailability } from "@/lib/transcribble/types";
import { cn } from "@/lib/utils";
import { buildStorageStatus } from "@/lib/transcribble/storage";
import { ThemeToggle } from "./theme-toggle";
import { KeyboardShortcut } from "./keyboard-shortcut";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  modelReady: boolean;
  mediaReady: boolean;
  warmingModel: boolean;
  warmingMedia: boolean;
  online: boolean;
  onPrimeModel: () => void | Promise<void>;
  onPrimeMedia: () => void | Promise<void>;
  onResetSetup: () => void;
  storagePersisted: boolean | null;
  storageUsed: number | null;
  storageAvailable: number | null;
  storageCanRequestPersistence: boolean;
  onAskForPersistent: () => void | Promise<void>;
  installPromptAvailable: boolean;
  installed: boolean;
  onInstall: () => void | Promise<void>;
  helperAvailable: boolean;
  helperSummary: string;
  helperNextAction?: string;
  helperUrl: string;
  helperBackendLabel?: string;
  helperCacheLabel: string;
  helperModels: LocalHelperModelAvailability[];
  helperModelProfile: HelperModelProfile;
  helperPhraseHints: string;
  helperSupportsAlignment: boolean;
  helperSupportsDiarization: boolean;
  helperAlignmentEnabled: boolean;
  helperDiarizationEnabled: boolean;
  onHelperModelProfileChange: (value: HelperModelProfile) => void;
  onHelperPhraseHintsChange: (value: string) => void;
  onHelperAlignmentChange: (value: boolean) => void;
  onHelperDiarizationChange: (value: boolean) => void;
  onRefreshHelper: () => void | Promise<void>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SettingsSheet({
  open,
  onClose,
  modelReady,
  mediaReady,
  warmingModel,
  warmingMedia,
  online,
  onPrimeModel,
  onPrimeMedia,
  onResetSetup,
  storagePersisted,
  storageUsed,
  storageAvailable,
  storageCanRequestPersistence,
  onAskForPersistent,
  installPromptAvailable,
  installed,
  onInstall,
  helperAvailable,
  helperSummary,
  helperNextAction,
  helperUrl,
  helperBackendLabel,
  helperCacheLabel,
  helperModels,
  helperModelProfile,
  helperPhraseHints,
  helperSupportsAlignment,
  helperSupportsDiarization,
  helperAlignmentEnabled,
  helperDiarizationEnabled,
  onHelperModelProfileChange,
  onHelperPhraseHintsChange,
  onHelperAlignmentChange,
  onHelperDiarizationChange,
  onRefreshHelper,
}: SettingsSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      firstFocusable?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (!panelRef.current) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKey);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const storageSummary = buildStorageStatus(storageUsed, storageAvailable);
  const browserToolsReady = modelReady && mediaReady;
  const persistentStorageDetail =
    storagePersisted === true
      ? "Browser granted persistent local storage"
      : storagePersisted === false
        ? "Browser may clear data under storage pressure"
        : "Not reported by this browser";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 z-50 flex items-end justify-center px-3 pb-3 pt-6 animate-fade-in sm:items-center sm:px-4"
    >
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className={cn(
          "relative flex w-full max-w-[42rem] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-[var(--shadow-float)]",
          "max-h-[min(90dvh,44rem)] animate-sheet-in",
        )}
      >
        <p id={descriptionId} className="sr-only">
          Manage local tools, storage, appearance, and shortcuts for this local workspace.
        </p>

        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
              {SETTINGS_SECTION_LABEL}
            </div>
            <div id={titleId} className="mt-1 text-[15px] font-semibold tracking-tight text-foreground">
              {SETTINGS_MODAL_TITLE}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-subtle transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-y flex-1 px-4 py-4 sm:px-5">
          <Block title="Browser tools">
            <Row
              label="Transcription model"
              detail={
                modelReady
                  ? "Downloaded on this device"
                  : online
                    ? "Not downloaded yet"
                    : "Go online once to download"
              }
              ready={modelReady}
            >
              {!modelReady ? (
                <ActionButton
                  onClick={() => void onPrimeModel()}
                  disabled={warmingModel || !online}
                >
                  {warmingModel ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {warmingModel ? "Downloading" : "Download"}
                </ActionButton>
              ) : null}
            </Row>

            <Row
              label="Video runtime"
              detail={
                mediaReady
                  ? "Ready for video imports and fallback media work"
                  : online
                    ? "Not downloaded yet"
                    : "Go online once to download"
              }
              ready={mediaReady}
            >
              {!mediaReady ? (
                <ActionButton
                  onClick={() => void onPrimeMedia()}
                  disabled={warmingMedia || !online}
                >
                  {warmingMedia ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {warmingMedia ? "Downloading" : "Download"}
                </ActionButton>
              ) : null}
            </Row>

            <Row
              label="Browser connection"
              detail={online ? "Online" : "Offline"}
              ready={online}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-border-strong px-2.5 py-1 text-[11px] font-medium",
                  online ? "text-success" : "text-warning",
                )}
              >
                {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {online ? "Online" : "Offline"}
              </span>
            </Row>

            <div className="pt-1">
              <button
                type="button"
                onClick={onResetSetup}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset setup status
              </button>
            </div>
          </Block>

          <Block title="Storage">
            <Row
              label="Local storage"
              detail={storageSummary.summary}
            />

            <Row
              label="Persistent storage"
              detail={persistentStorageDetail}
              ready={storagePersisted === true}
            >
              {storageCanRequestPersistence && storagePersisted !== true ? (
                <ActionButton onClick={() => void onAskForPersistent()}>
                  <Shield className="h-3 w-3" />
                  Ask browser
                </ActionButton>
              ) : null}
            </Row>
          </Block>

          <Block title="Local accelerator">
            <Row
              label="Transcribble Helper"
              detail={helperSummary}
              ready={helperAvailable}
            >
              <ActionButton onClick={() => void onRefreshHelper()}>
                Refresh
              </ActionButton>
            </Row>

            <Row
              label="Local endpoint"
              detail={helperUrl}
              ready={helperAvailable}
            />

            <Row
              label="Backend and cache"
              detail={`${helperBackendLabel ?? "Waiting for helper"} · ${helperCacheLabel}`}
              ready={helperAvailable}
            />

            {!helperAvailable ? (
              <DisclosureCard
                title="Install the helper"
                detail={
                  helperNextAction ??
                  "Run the helper check command first so it can tell you exactly whether ffmpeg, ffprobe, the helper virtualenv, or the localhost service is missing."
                }
                defaultOpen
              >
                <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
                  <CommandStep
                    label="Diagnose this machine first"
                    command={LOCAL_ACCELERATOR_CHECK_COMMAND}
                  />
                  <CommandStep
                    label="Install Python dependencies"
                    command={LOCAL_ACCELERATOR_INSTALL_COMMAND}
                  />
                  <CommandStep
                    label="Start the localhost helper"
                    command={LOCAL_ACCELERATOR_START_COMMAND}
                  />
                  <CommandStep
                    label="Re-check localhost health and capabilities"
                    command={LOCAL_ACCELERATOR_CHECK_COMMAND}
                  />
                </div>
              </DisclosureCard>
            ) : null}

            <DisclosureCard
              title="Advanced helper options"
              detail={
                helperAvailable
                  ? "Tune the local accelerator, phrase dictionary, and optional slower passes."
                  : "Helper tuning appears here once the localhost service is available."
              }
            >
              <div className="space-y-3">
                <div className="rounded-xl border border-border/80 bg-surface/70 px-3 py-3">
                  <label className="block text-[13px] font-medium text-foreground" htmlFor={`${titleId}-helper-model`}>
                    Model profile
                  </label>
                  <select
                    id={`${titleId}-helper-model`}
                    value={helperModelProfile}
                    onChange={(event) => onHelperModelProfileChange(event.target.value as HelperModelProfile)}
                    className="mt-2 h-10 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground ring-focus"
                  >
                    <option value="fast">Fast mode</option>
                    <option value="accurate">Accuracy mode</option>
                  </select>
                  {helperModels.length > 0 ? (
                    <div className="mt-3 space-y-2 text-[11px] leading-5 text-muted-foreground">
                      {helperModels.map((model) => (
                        <div key={model.profile} className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                          <div className="font-medium text-foreground">
                            {model.label}
                            {model.recommended ? " · Recommended" : ""}
                          </div>
                          <div className="mt-0.5">
                            {model.modelName}
                            {typeof model.diskUsageBytes === "number"
                              ? ` · ${(model.diskUsageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                              : ""}
                            {model.downloaded ? " · Cached locally" : " · Downloads on first use"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border/80 bg-surface/70 px-3 py-3">
                  <label className="block text-[13px] font-medium text-foreground" htmlFor={`${titleId}-helper-hints`}>
                    Phrase dictionary
                  </label>
                  <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                    Names, acronyms, and domain terms to bias the local accelerator.
                  </p>
                  <textarea
                    id={`${titleId}-helper-hints`}
                    value={helperPhraseHints}
                    onChange={(event) => onHelperPhraseHintsChange(event.target.value)}
                    rows={4}
                    placeholder="Acme Ops&#10;RFP&#10;Maya Patel"
                    className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-[12px] text-foreground ring-focus"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-xl border border-border/80 bg-surface/70 px-3 py-3 text-[12px]">
                    <input
                      type="checkbox"
                      checked={helperAlignmentEnabled}
                      disabled={!helperSupportsAlignment}
                      onChange={(event) => onHelperAlignmentChange(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Optional alignment</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {helperSupportsAlignment ? "Add a slower second pass when supported." : "Unavailable in the current helper build."}
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-border/80 bg-surface/70 px-3 py-3 text-[12px]">
                    <input
                      type="checkbox"
                      checked={helperDiarizationEnabled}
                      disabled={!helperSupportsDiarization}
                      onChange={(event) => onHelperDiarizationChange(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border"
                    />
                    <span>
                      <span className="block font-medium text-foreground">Optional diarization</span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {helperSupportsDiarization ? "Try local speaker labeling when the machine can handle it." : "Unavailable in the current helper build."}
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </DisclosureCard>
          </Block>

          {installPromptAvailable || installed ? (
            <Block title="Install">
              <Row
                label="Desktop app"
                detail={installed ? "Installed on this device" : "Install to launch like a native app"}
                ready={installed}
              >
                {installPromptAvailable && !installed ? (
                  <ActionButton onClick={() => void onInstall()}>
                    <Download className="h-3 w-3" />
                    Install
                  </ActionButton>
                ) : null}
              </Row>
            </Block>
          ) : null}

          <Block title="Appearance">
            <Row label="Theme" detail="System, light, or dark">
              <ThemeToggle />
            </Row>
          </Block>

          <DisclosureCard
            title="Keyboard shortcuts"
            detail={browserToolsReady ? "Keep the frequent actions close without keeping them on screen." : "Shortcuts stay available while setup finishes."}
          >
            <div className="space-y-2">
              <ShortcutRow label="Play / pause" shortcutId="play-pause" />
              <ShortcutRow label="Previous / next segment" shortcutId="prev-next-segment" />
              <ShortcutRow label="Toggle bookmark" shortcutId="toggle-bookmark" />
              <ShortcutRow label="Search library" shortcutId="search-library" />
              <ShortcutRow label="Find in transcript" shortcutId="search-transcript" />
              <ShortcutRow label={IMPORT_FILE_LABEL} shortcutId="add-recording" />
              <ShortcutRow label="Export" shortcutId="export" />
              <ShortcutRow label="Toggle inspector" shortcutId="toggle-inspector" />
              <ShortcutRow label="Settings" shortcutId="settings" />
            </div>
          </DisclosureCard>

          <div className="rounded-xl bg-muted/40 px-3 py-3 text-[11px] leading-5 text-muted-foreground">
            {SETTINGS_PRIVACY_COPY}
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  detail,
  ready,
  children,
}: {
  label: string;
  detail?: string;
  ready?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/80 bg-surface/70 px-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          {ready ? <Check className="h-3.5 w-3.5 text-success" /> : null}
          <span>{label}</span>
        </div>
        {detail ? <div className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{detail}</div> : null}
      </div>
      {children}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] text-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-50 ring-focus"
    >
      {children}
    </button>
  );
}

function CommandStep({
  label,
  command,
}: {
  label: string;
  command: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
      <div className="font-medium text-foreground">{label}</div>
      <code className="mt-0.5 block text-[11px] text-muted-foreground">{command}</code>
    </div>
  );
}

function ShortcutRow({
  label,
  shortcutId,
}: {
  label: string;
  shortcutId:
    | "play-pause"
    | "prev-next-segment"
    | "toggle-bookmark"
    | "search-library"
    | "search-transcript"
    | "add-recording"
    | "export"
    | "toggle-inspector"
    | "settings";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface/70 px-3 py-2.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <KeyboardShortcut shortcutId={shortcutId} />
    </div>
  );
}

function DisclosureCard({
  title,
  detail,
  defaultOpen = false,
  children,
}: {
  title: string;
  detail?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group mb-6 rounded-2xl border border-border/80 bg-surface/70 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground">{title}</div>
          {detail ? <div className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{detail}</div> : null}
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-subtle transition-transform duration-150 group-open:rotate-90" />
      </summary>
      <div className="border-t border-border/80 px-3 py-3">{children}</div>
    </details>
  );
}
