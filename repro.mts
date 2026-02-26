#!/usr/bin/env npx tsx
/**
 * Cloudflare Sandbox Error Code 137 Reproduction
 *
 * This script starts the worker and triggers the bug automatically.
 * The bug is intermittent, so we spam requests to trigger it.
 *
 * Single mode is tested:
 * Durable Object mode: calls sandbox.* from within ReproAgent (matches production)
 *
 * Requires: Docker running, pnpm installed
 *
 * Usage: npx tsx repro.mts
 */

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";

const BASE_URL = "http://localhost:8787";
const SPAM_COUNT = 5; // Number of parallel requests to send
const ROUNDS = 5; // Number of rounds of spamming

function log(message: string) {
  console.log(message);
}

function logHeader(message: string) {
  log("");
  log("==========================================");
  log(message);
  log("==========================================");
}

function checkDocker(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function installDependencies() {
  if (!existsSync("node_modules")) {
    log("Installing dependencies...");
    execSync("pnpm install", { stdio: "inherit" });
  }
}

function resetDockerState() {
  log("Resetting local Docker images and cache...");

  const containerIds = execSync("docker ps -aq", { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);

  if (containerIds.length > 0) {
    log(`Removing ${containerIds.length} container(s)...`);
    execSync(`docker rm -f ${containerIds.join(" ")}`, { stdio: "inherit" });
  }

  const imageIds = execSync("docker images -aq", { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);

  if (imageIds.length > 0) {
    log(`Removing ${imageIds.length} image(s)...`);
    execSync(`docker rmi -f ${imageIds.join(" ")}`, { stdio: "inherit" });
  }

  execSync("docker builder prune -a -f", { stdio: "inherit" });
}

async function waitForServer(maxAttempts = 30): Promise<boolean> {
  log("Waiting for server to start...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        log("Server is ready!");
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

async function makeRequest(endpoint: string): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`);
    return await response.text();
  } catch (error) {
    return `Error: ${error}`;
  }
}

async function spamEndpoint({
  endpoint,
  count,
}: {
  endpoint: string;
  count: number;
}): Promise<void> {
  log(`Sending ${count} parallel requests to ${endpoint}...`);

  const promises = Array.from({ length: count }, (_, i) =>
    makeRequest(`${endpoint}?req=${i}`).then((result) => {
      // Only log errors or interesting results
      if (result.includes("error") || result.includes("Error")) {
        log(`Request ${i}: ${result}`);
      }
    })
  );

  await Promise.allSettled(promises);
  log(`Completed ${count} requests to ${endpoint}`);
}

async function main() {
  logHeader("Cloudflare Sandbox Port-Check Failure Repro");
  log("");
  log("This bug is intermittent - we'll spam requests to trigger it.");
  log(`Config: ${SPAM_COUNT} parallel requests x ${ROUNDS} rounds`);

  // Check Docker
  if (!checkDocker()) {
    log("ERROR: Docker is not running. Please start Docker first.");
    process.exit(1);
  }

  // Install dependencies if needed
  installDependencies();

  // Force a fresh Docker state for reproducibility
  resetDockerState();

  log("Starting wrangler dev server in background...");

  // Start wrangler dev
  const wrangler = spawn("pnpm", ["dev"], {
    stdio: ["ignore", "inherit", "inherit"],
    shell: true,
  });

  // Handle cleanup on exit
  const cleanup = () => {
    log("");
    log("Stopping wrangler...");
    wrangler.kill();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Wait for server
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const serverReady = await waitForServer();

  if (!serverReady) {
    log("ERROR: Server failed to start after 30 seconds");
    wrangler.kill();
    process.exit(1);
  }

  logHeader("Durable Object mode (production pattern)");
  log("This mode mirrors how ReproAgent calls sandbox.* in production");

  log("");
  log("Step 1: Initialize sandbox via DO (GET /do/init)");
  const doInitResult = await makeRequest("/do/init");
  log(doInitResult);

  log("");
  log("Step 2: Verify MinIO path via rclone (GET /do/minio-check)");
  const minioResult = await makeRequest("/do/minio-check");
  log(minioResult);

  log("");
  log("Step 3: Spamming writeFile via DO calls");
  log("Watch for: Error checking 3000 / Container crashed while checking for ports");

  for (let round = 1; round <= ROUNDS; round++) {
    log(`--- DO Round ${round}/${ROUNDS} ---`);
    await Promise.all([
      spamEndpoint({ endpoint: "/do/write", count: SPAM_COUNT }),
      spamEndpoint({ endpoint: "/do/init", count: Math.floor(SPAM_COUNT / 2) }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logHeader("Stress test complete!");
  log("");
  log("Check the wrangler logs above for:");
  log("  Error checking 3000: connect(): Connection refused");
  log("  Container crashed while checking for ports");
  log("");
  log("If you didn't see the error, try running again or increase SPAM_COUNT/ROUNDS in repro.mts");
  log("");
  log("Press Ctrl+C to stop the server");

  // Keep running so logs are visible
  await new Promise(() => {});
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
