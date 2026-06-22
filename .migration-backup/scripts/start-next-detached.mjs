import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [, , portArg = "3003", hostnameArg = "127.0.0.1"] = process.argv;

const port = String(portArg);
const hostname = String(hostnameArg);
const logsDir = path.resolve(process.cwd(), ".logs");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const distDir = `.next-dev-${port}`;
const distPath = path.resolve(process.cwd(), distDir);

mkdirSync(logsDir, { recursive: true });
rmSync(distPath, { recursive: true, force: true });

const stdoutPath = path.join(logsDir, `next-dev-${port}-${timestamp}.out.log`);
const stderrPath = path.join(logsDir, `next-dev-${port}-${timestamp}.err.log`);
const runnerPath = path.join(logsDir, `next-dev-${port}-${timestamp}.cmd`);

const root = process.cwd();
const node = process.execPath;
const nextBin = path.resolve(root, "node_modules/next/dist/bin/next");

writeFileSync(
  runnerPath,
  [
    "@echo off",
    `cd /d "${root}"`,
    `set "NEXT_DIST_DIR=${distDir}"`,
    "set \"NEXT_PUBLIC_DISABLE_PWA=true\"",
    `"${node}" "${nextBin}" dev --hostname "${hostname}" --port "${port}" 1>> "${stdoutPath}" 2>> "${stderrPath}"`
  ].join("\r\n"),
  "utf8"
);

const command = `start "RideSpot Next Dev ${port}" /min C:\\Windows\\System32\\cmd.exe /d /c ""${runnerPath}""`;

const result = spawnSync("C:\\Windows\\System32\\cmd.exe", ["/d", "/c", command], {
  cwd: root,
  stdio: "ignore",
  windowsHide: true
});

if (result.error || result.status !== 0) {
  throw result.error ?? new Error(`cmd start failed with status ${result.status}`);
}

console.log(JSON.stringify({ port, hostname, stdoutPath, stderrPath, runnerPath }, null, 2));
