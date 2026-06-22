import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [, , portArg = "3003", hostnameArg = "127.0.0.1"] = process.argv;

const port = String(portArg);
const hostname = String(hostnameArg);
const root = process.cwd();
const logsDir = path.resolve(root, ".logs");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

mkdirSync(logsDir, { recursive: true });

const stdoutPath = path.join(logsDir, `next-start-${port}-${timestamp}.out.log`);
const stderrPath = path.join(logsDir, `next-start-${port}-${timestamp}.err.log`);
const runnerPath = path.join(logsDir, `next-start-${port}-${timestamp}.cmd`);
const node = process.execPath;
const nextBin = path.resolve(root, "node_modules/next/dist/bin/next");

writeFileSync(
  runnerPath,
  [
    "@echo off",
    `cd /d "${root}"`,
    "set \"NEXT_DIST_DIR=.next-prod\"",
    `"${node}" "${nextBin}" start --hostname "${hostname}" --port "${port}" 1>> "${stdoutPath}" 2>> "${stderrPath}"`
  ].join("\r\n"),
  "utf8"
);

const command = `start "RideSpot Next ${port}" /min C:\\Windows\\System32\\cmd.exe /d /c ""${runnerPath}""`;

const result = spawnSync("C:\\Windows\\System32\\cmd.exe", ["/d", "/c", command], {
  cwd: root,
  stdio: "ignore",
  windowsHide: true
});

if (result.error || result.status !== 0) {
  throw result.error ?? new Error(`cmd start failed with status ${result.status}`);
}

console.log(JSON.stringify({ port, hostname, stdoutPath, stderrPath, runnerPath }, null, 2));
