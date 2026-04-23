import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperDir = path.join(repoRoot, "helper");
const venvDir = path.join(helperDir, ".venv");

function findPython() {
  for (const candidate of ["python3", "python"]) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (result.status === 0) {
      return candidate;
    }
  }

  throw new Error("Python was not found. Install Python 3 before running the helper install.");
}

function venvPython() {
  if (process.platform === "win32") {
    return path.join(venvDir, "Scripts", "python.exe");
  }

  return path.join(venvDir, "bin", "python");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: repoRoot,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasBinary(command) {
  return spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0;
}

const python = findPython();

if (!existsSync(venvPython())) {
  run(python, ["-m", "venv", venvDir]);
}

run(venvPython(), ["-m", "pip", "install", "--upgrade", "pip"]);
run(venvPython(), ["-m", "pip", "install", "-r", path.join(helperDir, "requirements.txt")]);

if (!hasBinary("ffmpeg") || !hasBinary("ffprobe")) {
  console.warn(
    "Transcribble Helper Python dependencies are installed, but ffmpeg/ffprobe were not found. Install those native tools before running `npm run helper:check`.",
  );
}
