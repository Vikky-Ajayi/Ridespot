import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(backendRoot, "..");
const mlRoot = path.resolve(repoRoot, "ml-service");
const modelPath = path.resolve(mlRoot, "src/models/ridespot_model.pkl");
const timeoutMs = 120000;

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
          reject(new Error("Could not allocate ML smoke-test port"));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "content-type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const body = await response.json();
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForMl(baseUrl) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 60000) {
    try {
      const health = await fetchJson(`${baseUrl}/health`, { timeoutMs: 5000 });
      if (health.response.ok && health.body.model_loaded === true) {
        return health.body;
      }
      lastError = new Error(`ML health returned ${health.response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw lastError ?? new Error("Timed out waiting for ML service");
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

assert(existsSync(modelPath), `Missing trained ML model at ${modelPath}`);

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
let child = null;
let stopping = false;
let exitCode = 0;

const hardTimeout = setTimeout(() => {
  exitCode = 1;
  console.error("smoke:ml-integration timed out");
  if (child) {
    child.kill("SIGKILL");
  }
}, timeoutMs);

try {
  child = spawn(
    "python",
    ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: mlRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.once("exit", (code) => {
    if (!stopping && code !== 0 && exitCode === 0) {
      exitCode = code ?? 1;
      if (stderr) {
        console.error(stderr);
      }
    }
  });

  const health = await waitForMl(baseUrl);
  dotenv.config({ path: path.resolve(backendRoot, ".env") });
  process.env.ML_SERVICE_URL = baseUrl;

  const mlClient = await import(pathToFileURL(path.resolve(backendRoot, "dist/services/ml.service.js")).href);
  const backendHealth = await mlClient.getModelHealth();
  const prediction = await mlClient.predictDemand({
    eventType: "Concert",
    eventCategory: "Entertainment",
    city: "London",
    country: "UK",
    venueCapacity: 90000,
    expectedAttendance: 75000,
    startHour: 19,
    endHour: 23,
    durationHours: 4,
    isWeekend: 1,
    isPublicHoliday: 0,
    isDettyDecember: 0
  });

  assert(backendHealth.loaded === true, "Backend ML health did not detect loaded model");
  assert(backendHealth.accuracy >= 0.85, "Backend ML health accuracy is below threshold");
  assert(prediction.modelVersion !== "rule-based-fallback", "Backend used fallback instead of real ML");
  assert(prediction.demandLevel === "very-high", "Unexpected ML prediction demand level");

  console.log(
    JSON.stringify(
      {
        passed: true,
        baseUrl,
        health,
        backendHealth,
        prediction: {
          demandLevel: prediction.demandLevel,
          demandScore: prediction.demandScore,
          confidence: prediction.confidence,
          driversNeeded: prediction.driversNeeded,
          modelVersion: prediction.modelVersion
        }
      },
      null,
      2
    )
  );
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
