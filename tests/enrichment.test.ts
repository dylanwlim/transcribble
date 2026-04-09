import assert from "node:assert/strict";
import test from "node:test";

import {
  type EnrichmentProvider,
  registerProvider,
  unregisterProvider,
  getRegisteredProviders,
} from "@/lib/transcribble/enrichment";

test("registerProvider adds a provider", () => {
  const provider = makeProvider("test-1", ["lookup"]);
  registerProvider(provider);
  const providers = getRegisteredProviders();
  assert.ok(providers.some((p) => p.id === "test-1"));
  unregisterProvider("test-1");
});

test("unregisterProvider removes a provider", () => {
  const provider = makeProvider("test-2", ["lookup"]);
  registerProvider(provider);
  unregisterProvider("test-2");
  const providers = getRegisteredProviders();
  assert.ok(!providers.some((p) => p.id === "test-2"));
});

test("getRegisteredProviders returns all providers", () => {
  const p1 = makeProvider("test-3", ["a"]);
  const p2 = makeProvider("test-4", ["b"]);
  registerProvider(p1);
  registerProvider(p2);
  const providers = getRegisteredProviders();
  assert.ok(providers.some((p) => p.id === "test-3"));
  assert.ok(providers.some((p) => p.id === "test-4"));
  unregisterProvider("test-3");
  unregisterProvider("test-4");
});

function makeProvider(id: string, kinds: string[]): EnrichmentProvider {
  return {
    id,
    name: `Test Provider ${id}`,
    kinds,
    fetch: async () => ({
      data: null,
      source: id,
      cached: false,
      fetchedAt: new Date().toISOString(),
    }),
  };
}
