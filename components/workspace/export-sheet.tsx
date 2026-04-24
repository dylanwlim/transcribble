"use client";

import { Download, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import type { ExportFormat } from "@/lib/transcribble/export";
import type { TranscriptProject } from "@/lib/transcribble/types";

interface ExportSheetProps {
  open: boolean;
  project: TranscriptProject | null;
  onClose: () => void;
  onDownload: (format: ExportFormat) => void;
  onCopy: () => void;
  copied: boolean;
}

const FORMATS: {
  value: ExportFormat;
  label: string;
  description: string;
}[] = [
  { value: "txt", label: "Text transcript", description: "Clean .txt output, no timestamps." },
  { value: "md", label: "Markdown", description: "Structured with bookmarks and ranges." },
  { value: "srt", label: "SubRip (.srt)", description: "Captioning subtitles." },
  { value: "vtt", label: "WebVTT (.vtt)", description: "Web-native captions." },
];

export function ExportSheet({
  open,
  project,
  onClose,
  onDownload,
  onCopy,
  copied,
}: ExportSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !project) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Export"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
    >
      <div
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-md rounded-xl border border-border bg-popover shadow-[var(--shadow-float)]",
          "animate-sheet-in",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-subtle">
              Export
            </div>
            <div className="text-[14px] font-semibold">{project.title}</div>
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

        <div className="p-2">
          {FORMATS.map((format) => (
            <button
              key={format.value}
              type="button"
              onClick={() => {
                onDownload(format.value);
                onClose();
              }}
              className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted ring-focus"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-subtle group-hover:bg-surface group-hover:text-foreground">
                <Download className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-foreground">
                  {format.label}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {format.description}
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-subtle mono">
                .{format.value}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCopy}
            className="text-[12px] font-medium text-foreground hover:underline ring-focus"
          >
            {copied ? "Copied to clipboard" : "Copy transcript"}
          </button>
          <span className="text-[10px] text-subtle">
            Files save locally.
          </span>
        </div>
      </div>
    </div>
  );
}
