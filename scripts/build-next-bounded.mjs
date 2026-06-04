import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const logsDir = path.resolve(root, ".logs");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const logPath = path.join(logsDir, `next-build-${timestamp}.log`);
const nextBin = require.resolve("next/dist/bin/next");
const tscBin = require.resolve("typescript/bin/tsc");
const phaseTimeoutMs = 390000;

mkdirSync(logsDir, { recursive: true });

function write(message) {
  const line = `${message}\n`;
  process.stdout.write(line);
  appendFileSync(logPath, line, "utf8");
}

function runPhase(name, command, args, options = {}) {
  write(JSON.stringify({ event: "phase_started", name, command, args }));

  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-prod",
      NEXT_TELEMETRY_DISABLED: "1",
      ...(options.env ?? {})
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
    timeout: phaseTimeoutMs,
    windowsHide: true
  });

  if (result.stdout) {
    appendFileSync(logPath, result.stdout, "utf8");
  }
  if (result.stderr) {
    appendFileSync(logPath, result.stderr, "utf8");
  }

  if (result.error) {
    throw new Error(`${name} failed: ${result.error.message}. Log: ${logPath}`);
  }

  if (result.status !== 0) {
    throw new Error(`${name} failed with status ${result.status}. Log: ${logPath}`);
  }

  write(JSON.stringify({ event: "phase_completed", name }));
}

try {
  runPhase("tailwind_entry_check", process.execPath, ["scripts/check-tailwind-entry.mjs"]);
  runPhase("typecheck", process.execPath, [tscBin, "--noEmit"]);
  runPhase("next_build", process.execPath, [nextBin, "build", "--no-lint"], {
    env: {
      NEXT_SKIP_TYPECHECK: "true"
    }
  });
  write(JSON.stringify({ event: "build_completed", logPath }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
