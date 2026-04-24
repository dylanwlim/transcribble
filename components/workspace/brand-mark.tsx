import React from "react";

import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  tileClassName?: string;
  glyphClassName?: string;
  title?: string;
}

export function BrandMark({
  className,
  tileClassName,
  glyphClassName,
  title,
}: BrandMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-grid place-items-center",
        className,
      )}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <span
        className={cn(
          "grid h-full w-full place-items-center rounded-[28%] bg-foreground text-background shadow-[0_1px_2px_rgba(15,15,20,0.18)]",
          tileClassName,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cn("h-[62%] w-[62%]", glyphClassName)}
          aria-hidden
        >
          {/* Audio waveform — left side */}
          <rect x="3" y="9" width="1.8" height="6" rx="0.9" />
          <rect x="6" y="5.5" width="1.8" height="13" rx="0.9" />
          <rect x="9" y="8" width="1.8" height="8" rx="0.9" />
          {/* Text lines — right side (transcription output) */}
          <rect x="13" y="7.5" width="8" height="1.6" rx="0.8" />
          <rect x="13" y="11.2" width="8" height="1.6" rx="0.8" />
          <rect x="13" y="14.9" width="5.5" height="1.6" rx="0.8" />
        </svg>
      </span>
    </span>
  );
}
