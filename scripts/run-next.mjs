import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const [, , mode = "dev", ...forwardArgs] = process.argv;

const readArgValue = (name, fallback) => {
  const exactIndex = forwardArgs.indexOf(name);

  if (exactIndex !== -1 && exactIndex + 1 < forwardArgs.length) {
    return forwardArgs[exactIndex + 1];
  }

  const inlineArg = forwardArgs.find((arg) => arg.startsWith(`${name}=`));
  return inlineArg ? inlineArg.slice(name.length + 1) : fallback;
};

const getDistDir = () => {
  if (mode === "dev") {
    const port = readArgValue("--port", "3000");
    return `.next-dev-${port}`;
  }

  return ".next-prod";
};

const distDir = getDistDir();
const distDirPath = path.resolve(process.cwd(), distDir);

if (mode === "dev" || mode === "build") {
  rmSync(distDirPath, { recursive: true, force: true });
}

const child = spawn(process.execPath, [nextBin, mode, ...forwardArgs], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_DIST_DIR: distDir
  },
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
