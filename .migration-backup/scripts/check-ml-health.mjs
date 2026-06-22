import http from "node:http";

const port = Number(process.argv[2] ?? 8010);
const host = process.argv[3] ?? "127.0.0.1";
const timeoutMs = Number(process.argv[4] ?? 30_000);
const startedAt = Date.now();

function requestHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host,
        port,
        path: "/health",
        timeout: 2_000
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

while (Date.now() - startedAt < timeoutMs) {
  const health = await requestHealth();
  if (health?.model_loaded) {
    console.log(
      JSON.stringify({
        event: "ml_service_ready",
        healthUrl: `http://${host}:${port}/health`,
        health
      })
    );
    process.exit(0);
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
}

console.error(
  JSON.stringify({
    event: "ml_service_not_ready",
    healthUrl: `http://${host}:${port}/health`,
    timeoutMs
  })
);
process.exit(1);
