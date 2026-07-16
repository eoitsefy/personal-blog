import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDirectories = [path.join(root, "src", "lib"), path.join(root, "src", "lib", "validators")];
const tests = testDirectories.flatMap((directory) =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => path.join(directory, entry.name)),
);

const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--test", ...tests],
  { cwd: root, env: process.env, stdio: "inherit" },
);

process.exit(result.status ?? 1);
