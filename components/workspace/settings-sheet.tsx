"use client";

import { Check, Download, Loader2, RotateCcw, Shield, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/transcribble/transcript";
import { ThemeToggle } from "./theme-toggle";

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
  storageQuota: number | null;
  onAskForPersistent: () => void | Promise<void>;
  installPromptAvailable: boolean;
  installed: boolean;
  onInstall: () => void | Promise<void>;
}

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
  storageQuota,
  onAskForPersistent,
  installPromptAvailable,
  installed,
  onInstall,
}: SettingsSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Settings"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
    >
      <div
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-[var(--shadow-float)]",
          "animate-sheet-in",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-subtle">
              Settings
            </div>
            <div className="text-[14px] font-semibold">Local workspace</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-subtle hover:bg-muted hover:text-foreground ring-focus"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-y max-h-[70vh] px-5 py-4">
          <Block title="Local tools">
            <Row
              label="Transcription model"
              detail={modelReady ? "Ready on this device" : online ? "Not downloaded yet" : "Go online once to download"}
              ready={modelReady}
            >
              {!modelReady ? (
                <button
                  type="button"
                  onClick={() => void onPrimeModel()}
                  disabled={warmingModel || !online}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50 ring-focus"
                >
                  {warmingModel ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {warmingModel ? "Downloading" : "Download"}
                </button>
              ) : null}
            </Row>
            <Row
              label="Video runtime"
              detail={mediaReady ? "Ready for video" : online ? "Not downloaded yet" : "Go online once to download"}
              ready={mediaReady}
            >
              {!mediaReady ? (
                <button
                  type="button"
                  onClick={() => void onPrimeMedia()}
                  disabled={warmingMedia || !online}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-muted disabled:opacity-50 ring-focus"
                >
                  {warmingMedia ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {warmingMedia ? "Downloading" : "Download"}
                </button>
              ) : null}
            </Row>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-subtle">
                {online ? "Online" : "Offline"}
              </span>
              <button
                type="button"
                onClick={onResetSetup}
                className="inline-flex items-center gap-1 text-subtle hover:text-foreground ring-focus"
              >
                <RotateCcw className="h-3 w-3" />
                Reset setup status
              </button>
            </div>
          </Block>

          <Block title="Storage">
            <Row
              label="Local storage"
              detail={
                storageUsed !== null && storageQuota
                  ? `${formatBytes(storageUsed)} used · ${formatBytes(storageQuota)} available`
                  : storageUsed !== null
                    ? `${formatBytes(storageUsed)} used`
                    : "Local storage"
              }
            />
            <Row
              label="Durable"
              detail={
                storagePersisted === true
                  ? "Browser confirms this data is protected"
                  : storagePersisted === false
                    ? "Browser may clear files under pressure"
                    : "Not reported by this browser"
              }
              ready={storagePersisted === true}
            >
              {storagePersisted !== true ? (
                <button
                  type="button"
                  onClick={() => void onAskForPersistent()}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-muted ring-focus"
                >
                  <Shield className="h-3 w-3" />
                  Ask browser
                </button>
              ) : null}
            </Row>
          </Block>

          {installPromptAvailable || installed ? (
            <Block title="Install">
              <Row
                label="Desktop app"
                detail={installed ? "Installed on this device" : "Install to launch like a native app"}
                ready={installed}
              >
                {installPromptAvailable && !installed ? (
                  <button
                    type="button"
                    onClick={() => void onInstall()}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-muted ring-focus"
                  >
                    <Download className="h-3 w-3" />
                    Install
                  </button>
                ) : null}
              </Row>
            </Block>
          ) : null}

          <Block title="Appearance">
            <div className="flex items-center justify-between py-2">
              <div className="text-[12px] text-foreground">Theme</div>
              <ThemeToggle />
            </div>
          </Block>

          <Block title="Shortcuts">
            <ShortcutRow label="Play / pause" keys={["Space"]} />
            <ShortcutRow label="Previous / next segment" keys={["K", "J"]} />
            <ShortcutRow label="Toggle bookmark" keys={["B"]} />
            <ShortcutRow label="Search library" keys={["⌘", "K"]} />
            <ShortcutRow label="Find in transcript" keys={["/"]} />
            <ShortcutRow label="Import file" keys={["⌘", "O"]} />
            <ShortcutRow label="Export" keys={["⌘", "E"]} />
            <ShortcutRow label="Toggle inspector" keys={["⌘", "\\"]} />
            <ShortcutRow label="Settings" keys={["⌘", ","]} />
          </Block>

          <div className="pt-2 text-[11px] leading-5 text-subtle">
            Recordings and transcript work stay in browser storage on this device.
            Transcribble does not upload your recordings.
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-subtle">
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
    <div className="flex items-center gap-3 py-1">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium">
          {ready ? <Check className="h-3 w-3 text-success" /> : null}
          {label}
        </div>
        {detail ? <div className="text-[11px] text-muted-foreground">{detail}</div> : null}
      </div>
      {children}
    </div>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-foreground mono"
          >
            {key}
          </kbd>
        ))}
      </span>
    </div>
  );
}
