/**
 * Render start: run Next.js without invoking pnpm/corepack (avoids npm registry timeouts on boot).
 * Set the service Start Command to: node scripts/render-start-nexa-frontend.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(root, "apps", "frontend");
const nextCli = path.join(frontendDir, "node_modules", "next", "dist", "bin", "next");

const result = spawnSync(process.execPath, [nextCli, "start", "-H", "0.0.0.0"], {
  stdio: "inherit",
  cwd: frontendDir,
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
