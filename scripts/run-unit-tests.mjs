import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(resolved);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [resolved] : [];
  });
}

const tests = findTests(path.join(root, "src", "lib"));

const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--test", ...tests],
  { cwd: root, env: process.env, stdio: "inherit" },
);

process.exit(result.status ?? 1);
