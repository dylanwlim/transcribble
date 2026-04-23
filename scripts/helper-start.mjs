import { spawn } from "node:child_process";
import {
  collectBlockingIssues,
  collectPreflight,
  fetchRunningHelper,
  ffmpegInstallHint,
  formatBackendLabel,
  helperBaseUrl,
  helperScriptPath,
  printPreflightSummary,
  repoRoot,
  venvPythonPath,
} from "./helper-support.mjs";

const prefix = "[helper-start]";
const preflight = collectPreflight();
printPreflightSummary(prefix, preflight);

const runningHelper = await fetchRunningHelper();
if (runningHelper.reachable) {
  const backendLabel = formatBackendLabel(
    runningHelper.capabilities?.backend ?? runningHelper.health?.backend,
  );

  if (!runningHelper.capabilities?.available) {
    console.error(
      `${prefix} A helper is already responding at ${helperBaseUrl}, but it is not ready. ${
        runningHelper.capabilities?.reason ?? "Fix the local dependencies and restart it."
      }`,
    );
    process.exit(1);
  }

  console.log(
    `${prefix} helper already running at ${helperBaseUrl} with backend ${backendLabel}.`,
  );
  process.exit(0);
}

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

const child = spawn(
  venvPythonPath(),
  [helperScriptPath],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
