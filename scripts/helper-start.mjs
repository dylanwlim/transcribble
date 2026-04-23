import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperDir = path.join(repoRoot, "helper");
const venvDir = path.join(helperDir, ".venv");

function venvPython() {
  if (process.platform === "win32") {
    return path.join(venvDir, "Scripts", "python.exe");
  }

  return path.join(venvDir, "bin", "python");
}

function findPython() {
  const candidate = venvPython();
  if (existsSync(candidate)) {
    return candidate;
  }

  console.error("Transcribble Helper is not installed yet. Run `npm run helper:install` first.");
  process.exit(1);
}

const child = spawn(
  findPython(),
  [path.join(helperDir, "transcribble_helper.py")],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
