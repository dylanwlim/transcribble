import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  collectPreflight,
  ffmpegInstallHint,
  helperDir,
  printPreflightSummary,
  repoRoot,
  venvDir,
  venvPythonPath,
} from "./helper-support.mjs";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: repoRoot,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const prefix = "[helper-install]";
const preflight = collectPreflight();
printPreflightSummary(prefix, preflight);

if (!preflight.systemPython) {
  console.error(`${prefix} Python 3 was not found. Install Python 3, then rerun npm run helper:install.`);
  process.exit(1);
}

if (!existsSync(venvPythonPath())) {
  console.log(`${prefix} creating helper virtualenv at ${venvDir}`);
  run(preflight.systemPython.command, ["-m", "venv", venvDir]);
}

run(venvPythonPath(), ["-m", "pip", "install", "--upgrade", "pip"]);
run(venvPythonPath(), ["-m", "pip", "install", "-r", `${helperDir}/requirements.txt`]);

const postflight = collectPreflight();

if (!postflight.venv.present || !postflight.venv.ok || !postflight.venv.preferredBackend) {
  console.error(
    `${prefix} The helper virtualenv exists but no usable local Whisper backend was detected. Re-run npm run helper:install and inspect the output above.`,
  );
  process.exit(1);
}

console.log(
  `${prefix} helper backend: ${postflight.venv.preferredBackend === "mlx-whisper" ? "MLX Whisper" : "faster-whisper"}${
    postflight.venv.preferredBackend === "mlx-whisper" ? " (preferred on Apple Silicon)" : ""
  }`,
);
console.log(`${prefix} helper Python: ${postflight.venv.pythonExecutable}`);
console.log(`${prefix} next: npm run helper:start`);
console.log(`${prefix} verify: npm run helper:check`);

if (!postflight.ffmpeg.found || !postflight.ffprobe.found) {
  console.warn(
    `${prefix} Python dependencies are installed, but ffmpeg/ffprobe are still missing. ${ffmpegInstallHint()}`,
  );
}
