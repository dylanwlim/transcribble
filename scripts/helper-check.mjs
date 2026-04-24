import {
  collectBlockingIssues,
  collectPreflight,
  fetchRunningHelper,
  ffmpegInstallHint,
  formatBackendLabel,
  helperBaseUrl,
  printPreflightSummary,
} from "./helper-support.mjs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const prefix = "[helper-check]";
const preflight = collectPreflight();
printPreflightSummary(prefix, preflight);

const runningHelper = await fetchRunningHelper();
if (!runningHelper.reachable) {
  const blockingIssues = collectBlockingIssues(preflight);

  if (blockingIssues.length > 0) {
    for (const issue of blockingIssues) {
      console.error(`${prefix} ${issue}`);
    }

    if (!preflight.ffmpeg.found || !preflight.ffprobe.found) {
      console.error(`${prefix} macOS fix: ${ffmpegInstallHint()}`);
    }

    if (!preflight.venv.present || !preflight.venv.preferredBackend) {
      console.error(`${prefix} install fix: npm run helper:install`);
    }

    process.exit(1);
  }

  fail(
    `${prefix} Helper is installed but not reachable at ${helperBaseUrl}. Run npm run helper:start.`,
  );
}

const { health, capabilities } = runningHelper;

console.log(
  `${prefix} helper: version=${health.version ?? "unknown"} protocol=${health.protocolVersion ?? "unknown"} endpoint=${helperBaseUrl} backend=${capabilities.backendLabel ?? formatBackendLabel(capabilities.backend)}`,
);

if (!capabilities.available) {
  fail(
    `${prefix} Helper responded but is not ready. ${capabilities.reason ?? "Check local dependencies and reinstall the helper."}`,
  );
}

console.log(
  `${prefix} ready: ffmpeg=${capabilities.ffmpegReady ? "yes" : "no"} ffprobe=${capabilities.ffprobeReady ? "yes" : "no"} models=${(capabilities.models ?? []).length} chunkWorkers=${capabilities.maxParallelChunks ?? 1}`,
);

for (const model of capabilities.models ?? []) {
  const diskLabel =
    typeof model.diskUsageBytes === "number" && model.diskUsageBytes > 0
      ? `${(model.diskUsageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB cached`
      : "not cached yet";
  console.log(
    `${prefix} model ${model.profile}: ${model.modelName} - ${model.downloaded ? diskLabel : "downloads on first use"}`,
  );
}
