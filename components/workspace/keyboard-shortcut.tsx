"use client";

import React, { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  detectShortcutPlatform,
  getShortcutTokens,
  type ShortcutId,
  type ShortcutPlatform,
} from "@/lib/transcribble/shortcuts";

export function KeyboardShortcut({
  shortcutId,
  className,
  keyClassName,
}: {
  shortcutId: ShortcutId;
  className?: string;
  keyClassName?: string;
}) {
  const [platform, setPlatform] = useState<ShortcutPlatform>("apple");

  useEffect(() => {
    setPlatform(detectShortcutPlatform());
  }, []);

  const tokens = getShortcutTokens(shortcutId, platform);

  return (
    <span aria-hidden className={cn("inline-flex items-center gap-1", className)}>
      {tokens.map((token) => (
        <kbd
          key={`${shortcutId}-${token}`}
          className={cn(
            "inline-flex min-w-[1.6rem] items-center justify-center rounded-full border border-border-strong bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground mono",
            keyClassName,
          )}
        >
          {token}
        </kbd>
      ))}
    </span>
  );
}
