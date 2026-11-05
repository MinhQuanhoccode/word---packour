const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const dotenv = require("dotenv");

const serverRoot = resolve(__dirname, "..");
const repoRoot = resolve(serverRoot, "..", "..");

dotenv.config({ path: resolve(repoRoot, ".env") });

const result = spawnSync(
  "pnpm",
  ["exec", "prisma", ...process.argv.slice(2)],
  {
    cwd: serverRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.error) {
  console.error("Failed to run Prisma CLI:", result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
