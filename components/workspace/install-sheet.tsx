"use client";

import { ChevronRight, MonitorUp, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

export type InstallPlatform =
  | "native-prompt"
  | "ios-safari"
  | "mac-safari"
  | "firefox"
  | "generic";

export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "generic";
  const ua = navigator.userAgent;

  if (/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) {
    return "ios-safari";
  }

  const isMac = /Mac/.test(ua);
  const isSafariLike =
    /Safari/.test(ua) && !/Chrome|Chromium|Edg|Brave|OPR/.test(ua);
  if (isMac && isSafariLike) return "mac-safari";

  if (/Firefox/.test(ua)) return "firefox";

  return "generic";
}

interface InstallSheetProps {
  open: boolean;
  onClose: () => void;
  platform: InstallPlatform;
  installed: boolean;
  onOpenInNewWindow?: () => void;
}

export function InstallSheet({
  open,
  onClose,
  platform,
  installed,
  onOpenInNewWindow,
}: InstallSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const steps = getSteps(platform);
  const title = installed
    ? "Open Transcribble as a desktop app"
    : "Add Transcribble to your dock";
  const subtitle = installed
    ? "Looks like you already installed it. Launch from Dock, Applications, or Home Screen."
    : "This keeps Transcribble one click away, in its own window, and fully local on this device.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
      />
      <div
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-float)] animate-rise-in",
        )}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-foreground">
            <MonitorUp className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold tracking-tight text-foreground">
              {title}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
              {subtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-subtle transition-colors duration-150 hover:bg-muted hover:text-foreground ring-focus"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <ol className="mt-4 space-y-2 px-5 pb-4 text-[13px] leading-6">
          {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground/80 tabular">
                {index + 1}
              </span>
              <span className="min-w-0 text-foreground/90">{step}</span>
            </li>
          ))}
        </ol>

        {installed && onOpenInNewWindow ? (
          <div className="border-t border-border bg-muted/30 px-5 py-3">
            <button
              type="button"
              onClick={() => {
                onOpenInNewWindow();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors duration-150 hover:bg-muted ring-focus"
            >
              Open in a new window
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getSteps(platform: InstallPlatform): string[] {
  switch (platform) {
    case "ios-safari":
      return [
        "Tap the Share icon in Safari's toolbar.",
        "Choose Add to Home Screen.",
        "Launch Transcribble from your Home Screen whenever you need it.",
      ];
    case "mac-safari":
      return [
        "In Safari's menu bar, open File.",
        "Choose Add to Dock… and confirm.",
        "Launch Transcribble from the Dock or Applications.",
      ];
    case "firefox":
      return [
        "Firefox does not yet install web apps as standalone windows.",
        "Open Transcribble in Chrome, Edge, Brave, or Safari to install it.",
        "In the meantime, pin this tab or bookmark it for one-click access.",
      ];
    case "native-prompt":
      return [
        "Your browser can install Transcribble directly.",
        "Click the install button in the address bar or the prompt that appears.",
        "Launch it from the Dock, Taskbar, or Applications.",
      ];
    case "generic":
    default:
      return [
        "Open your browser's menu and look for Install app or Add to Dock.",
        "Confirm the install prompt when it appears.",
        "Launch Transcribble from the Dock, Taskbar, or Applications.",
      ];
  }
}
