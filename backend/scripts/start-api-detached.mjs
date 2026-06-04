import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(import.meta.dirname, "..");
const logsDir = path.resolve(rootDir, ".logs");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const stdoutPath = path.join(logsDir, `api-${timestamp}.out.log`);
const stderrPath = path.join(logsDir, `api-${timestamp}.err.log`);
const runnerPath = path.join(logsDir, `api-${timestamp}.cmd`);

mkdirSync(logsDir, { recursive: true });

const node = process.execPath;
const server = path.resolve(rootDir, "dist/server.js");
const port = process.env.PORT ?? "4000";

writeFileSync(
  runnerPath,
  [
    "@echo off",
    `cd /d "${rootDir}"`,
    `set "PORT=${port}"`,
    `"${node}" "${server}" 1>> "${stdoutPath}" 2>> "${stderrPath}"`
  ].join("\r\n"),
  "utf8"
);

const command = `start "RideSpot API ${port}" /min C:\\Windows\\System32\\cmd.exe /d /c ""${runnerPath}""`;

const result = spawnSync("C:\\Windows\\System32\\cmd.exe", ["/d", "/c", command], {
  cwd: rootDir,
  stdio: "ignore",
  windowsHide: true
});

if (result.error || result.status !== 0) {
  throw result.error ?? new Error(`cmd start failed with status ${result.status}`);
}

console.log(
  JSON.stringify(
    {
      pid: null,
      url: "http://127.0.0.1:4000",
      stdoutPath,
      stderrPath,
      runnerPath
    },
    null,
    2
  )
);
