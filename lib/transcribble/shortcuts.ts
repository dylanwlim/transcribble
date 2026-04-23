export type ShortcutPlatform = "apple" | "other";

export type ShortcutId =
  | "search-library"
  | "add-recording"
  | "export"
  | "settings"
  | "toggle-inspector"
  | "play-pause"
  | "prev-next-segment"
  | "toggle-bookmark"
  | "search-transcript";

type ShortcutToken = "mod" | string;

const SHORTCUTS: Record<ShortcutId, readonly ShortcutToken[]> = {
  "search-library": ["mod", "K"],
  "add-recording": ["mod", "O"],
  export: ["mod", "E"],
  settings: ["mod", ","],
  "toggle-inspector": ["mod", "\\"],
  "play-pause": ["Space"],
  "prev-next-segment": ["K", "J"],
  "toggle-bookmark": ["B"],
  "search-transcript": ["/"],
};

export function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") {
    return "apple";
  }

  const platform =
    (navigator as Navigator & {
      userAgentData?: {
        platform?: string;
      };
    }).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent ??
    "";

  return /mac|iphone|ipad|ipod/i.test(platform) ? "apple" : "other";
}

export function resolveShortcutTokens(
  tokens: readonly ShortcutToken[],
  platform: ShortcutPlatform,
) {
  return tokens.map((token) => {
    if (token !== "mod") {
      return token;
    }

    return platform === "apple" ? "⌘" : "Ctrl";
  });
}

export function getShortcutTokens(
  shortcutId: ShortcutId,
  platform: ShortcutPlatform = detectShortcutPlatform(),
) {
  return resolveShortcutTokens(SHORTCUTS[shortcutId], platform);
}

export function formatShortcutTitle(
  shortcutId: ShortcutId,
  platform: ShortcutPlatform = detectShortcutPlatform(),
) {
  return getShortcutTokens(shortcutId, platform).join(" ");
}
