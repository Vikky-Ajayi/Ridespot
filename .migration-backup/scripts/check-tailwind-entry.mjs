import { readFileSync } from "node:fs";
import path from "node:path";

const globalsPath = path.resolve(process.cwd(), "src/app/globals.css");
const globalsContent = readFileSync(globalsPath, "utf8");

const requiredHeader = [
  "@tailwind base;",
  "@tailwind components;",
  "@tailwind utilities;"
].join("\n");

if (!globalsContent.startsWith(requiredHeader)) {
  console.error(
    [
      "Tailwind entry check failed.",
      "src/app/globals.css must start with these three lines exactly:",
      requiredHeader
    ].join("\n")
  );
  process.exit(1);
}
