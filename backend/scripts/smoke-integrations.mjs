import dotenv from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke:integrations timed out");
  process.exit(1);
}, 70000);

let exitCode = 0;

try {
  const { getIntegrationStatuses } = await import(
    pathToFileURL(resolve(backendRoot, "dist/services/integrationHealth.service.js")).href
  );
  const result = await getIntegrationStatuses();
  const requiredProviders = ["hereMaps", "ticketmaster"];
  const failedRequired = result.integrations.filter(
    (item) => requiredProviders.includes(item.name) && !item.canIngest
  );

  console.log(JSON.stringify(result, null, 2));

  if (failedRequired.length > 0) {
    throw new Error(
      `Required integrations failed: ${failedRequired
        .map((item) => `${item.name} (${item.message})`)
        .join(", ")}`
    );
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  clearTimeout(timeout);
}

process.exit(exitCode);
