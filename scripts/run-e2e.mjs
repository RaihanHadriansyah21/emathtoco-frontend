import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const host = "127.0.0.1";
const port = "3000";
const serverUrl = `http://${host}:${port}/login`;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", host, "-p", port],
  {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  },
);

let serverExited = false;
server.once("exit", () => {
  serverExited = true;
});

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (serverExited) {
      throw new Error("Next.js berhenti sebelum siap untuk E2E.");
    }
    try {
      const response = await fetch(serverUrl, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js tidak siap dalam 120 detik.");
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function stopServer() {
  if (serverExited || !server.pid) {
    return;
  }
  const serverExit = waitForExit(server);
  server.kill();
  await Promise.race([
    serverExit,
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);

  if (!serverExited && process.platform === "win32") {
    spawnSync(
      "taskkill",
      ["/pid", String(server.pid), "/t", "/f"],
      { stdio: "ignore" },
    );
    await Promise.race([
      serverExit,
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  server.unref();
}

let exitCode = 1;
try {
  await waitForServer();
  const playwright = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    { env: process.env, stdio: "inherit" },
  );
  exitCode = await waitForExit(playwright);
} finally {
  await stopServer();
}

process.exit(exitCode);
