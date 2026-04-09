/**
 * Optional enrichment provider interface.
 *
 * All enrichments are:
 * - optional and non-blocking for the core product
 * - cache-first via IndexedDB (CachedLookup store)
 * - rate-limited and debounced
 * - adapter-based with a clean provider interface
 * - behind feature flags (see `isEnrichmentEnabled`)
 * - failure-tolerant: core flows never depend on enrichment success
 *
 * No paid API or mandatory cloud backend is introduced.
 * Only free/open/public data sources should be implemented as providers.
 */

import { getCachedLookup, putCachedLookup } from "@/lib/transcribble/workspace-db";

const FEATURE_FLAGS_KEY = "transcribble-feature-flags-v1";

const DEFAULT_FLAGS: FeatureFlags = {
  enrichments: false,
};

export interface FeatureFlags {
  enrichments: boolean;
}

export interface EnrichmentRequest {
  kind: string;
  query: string;
  context?: Record<string, unknown>;
}

export interface EnrichmentResult<T = unknown> {
  data: T;
  source: string;
  cached: boolean;
  fetchedAt: string;
}

export interface EnrichmentProvider {
  id: string;
  name: string;
  kinds: string[];
  fetch(request: EnrichmentRequest): Promise<EnrichmentResult>;
}

const providers = new Map<string, EnrichmentProvider>();
const pendingRequests = new Map<string, Promise<EnrichmentResult | null>>();

const DEFAULT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1000;

let lastRequestTime = 0;

export function readFeatureFlags(): FeatureFlags {
  if (typeof window === "undefined") {
    return DEFAULT_FLAGS;
  }

  try {
    const stored = window.localStorage.getItem(FEATURE_FLAGS_KEY);
    if (!stored) {
      return DEFAULT_FLAGS;
    }
    return { ...DEFAULT_FLAGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_FLAGS;
  }
}

export function writeFeatureFlags(flags: Partial<FeatureFlags>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = readFeatureFlags();
    window.localStorage.setItem(
      FEATURE_FLAGS_KEY,
      JSON.stringify({ ...current, ...flags }),
    );
  } catch {
    // Ignore storage failures in restrictive browser contexts.
  }
}

export function isEnrichmentEnabled(): boolean {
  return readFeatureFlags().enrichments;
}

export function registerProvider(provider: EnrichmentProvider) {
  providers.set(provider.id, provider);
}

export function unregisterProvider(id: string) {
  providers.delete(id);
}

export function getRegisteredProviders(): EnrichmentProvider[] {
  return [...providers.values()];
}

function cacheKey(request: EnrichmentRequest): string {
  return `enrichment:${request.kind}:${request.query}`;
}

export async function fetchEnrichment(
  request: EnrichmentRequest,
  options: { cacheTtlMs?: number; skipCache?: boolean } = {},
): Promise<EnrichmentResult | null> {
  if (!isEnrichmentEnabled()) {
    return null;
  }

  const key = cacheKey(request);

  if (!options.skipCache) {
    const cached = await getCachedLookup<EnrichmentResult>(key);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  const existing = pendingRequests.get(key);
  if (existing) {
    return existing;
  }

  const provider = [...providers.values()].find((p) =>
    p.kinds.includes(request.kind),
  );

  if (!provider) {
    return null;
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed),
    );
  }

  const pending = (async (): Promise<EnrichmentResult | null> => {
    try {
      lastRequestTime = Date.now();
      const result = await provider.fetch(request);
      await putCachedLookup(
        key,
        result,
        options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
      );
      return { ...result, cached: false };
    } catch {
      return null;
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, pending);
  return pending;
}
