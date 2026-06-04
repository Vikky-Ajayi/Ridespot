import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const distDir = ".next-prod";
const distPath = path.resolve(root, distDir);
const nextBin = require.resolve("next/dist/bin/next");
const timeoutMs = 120000;

const routes = [
  "/",
  "/app/home?preview=app",
  "/app/hotspots?preview=app",
  "/app/profile?preview=app",
  "/admin/login",
  "/admin/config/markets",
  "/admin/drivers",
  "/admin/events",
  "/admin/hotspots",
  "/admin/ml",
  "/admin/notifications"
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address !== "object") {
          reject(new Error("Could not allocate smoke-test port"));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(baseUrl) {
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < 60000) {
    try {
      const response = await fetchWithTimeout(baseUrl, 5000);
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`Server responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw lastError ?? new Error("Timed out waiting for Next server");
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}

if (!existsSync(distPath)) {
  throw new Error(`Missing ${distDir}. Run npm run build before npm run smoke:frontend.`);
}

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
let child = null;
let exitCode = 0;
let stopping = false;

const hardTimeout = setTimeout(() => {
  exitCode = 1;
  console.error("smoke:frontend timed out");
  if (child) {
    child.kill("SIGKILL");
  }
}, timeoutMs);

try {
  child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NEXT_DIST_DIR: distDir
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.once("exit", (code) => {
    if (!stopping && code !== 0 && exitCode === 0) {
      exitCode = code ?? 1;
    }
  });

  await waitForServer(baseUrl);

  const checks = [];
  for (const route of routes) {
    const response = await fetchWithTimeout(`${baseUrl}${route}`);
    checks.push({ route, status: response.status });
    assert(response.status === 200, `${route} returned ${response.status}`);
  }

  console.log(JSON.stringify({ passed: true, baseUrl, checks }, null, 2));
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  clearTimeout(hardTimeout);
  if (child) {
    stopping = true;
    await stopChild(child);
  }
}

process.exit(exitCode);
