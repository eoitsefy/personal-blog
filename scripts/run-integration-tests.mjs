import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL is required and must point to a disposable PostgreSQL database.");
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" };

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(path.join(root, "node_modules", "prisma", "build", "index.js"), ["migrate", "deploy"]);
run(path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), ["--test", "src/integration/content-management.integration.test.ts"]);
