import { spawnSync } from "node:child_process";

const host = process.env.TRANSCRIBBLE_HELPER_HOST ?? "127.0.0.1";
const port = process.env.TRANSCRIBBLE_HELPER_PORT ?? "7771";
const baseUrl = `http://${host}:${port}`;

function hasBinary(command) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  return result.status === 0;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

console.log(`[helper-check] ffmpeg: ${hasBinary("ffmpeg") ? "found" : "missing"}`);
console.log(`[helper-check] ffprobe: ${hasBinary("ffprobe") ? "found" : "missing"}`);

let health;
try {
  const response = await fetch(`${baseUrl}/health`, {
    cache: "no-store",
  });
  if (!response.ok) {
    fail(`[helper-check] Health request failed with ${response.status}.`);
  }
  health = await response.json();
} catch {
  fail(
    `[helper-check] Helper not reachable at ${baseUrl}. Run npm run helper:start after npm run helper:install.`,
  );
}

const capabilitiesResponse = await fetch(`${baseUrl}/capabilities`, {
  cache: "no-store",
});
if (!capabilitiesResponse.ok) {
  fail(`[helper-check] Capabilities request failed with ${capabilitiesResponse.status}.`);
}

const capabilities = await capabilitiesResponse.json();

console.log(
  `[helper-check] helper: version=${health.version ?? "unknown"} protocol=${health.protocolVersion ?? "unknown"} backend=${capabilities.backendLabel ?? capabilities.backend ?? "none"}`,
);

if (!capabilities.available) {
  fail(
    `[helper-check] Helper responded but is not ready. ${capabilities.reason ?? "Check local dependencies and reinstall the helper."}`,
  );
}

console.log(
  `[helper-check] ready: ffmpeg=${capabilities.ffmpegReady ? "yes" : "no"} ffprobe=${capabilities.ffprobeReady ? "yes" : "no"} models=${(capabilities.models ?? []).length}`,
);
