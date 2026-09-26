const path = require("node:path");
const fs = require("node:fs");

const SANDBOX_NAME = String(process.env.VERCEL_SANDBOX_NAME || "rebook-whatsapp-worker");
const SANDBOX_PROJECT_ID = String(process.env.VERCEL_SANDBOX_PROJECT_ID || process.env.VERCEL_PROJECT_ID || "prj_DSQLRKITHzL5lBtWruqVZsaGv8D8");
const SANDBOX_TEAM_ID = String(process.env.VERCEL_TEAM_ID || "team_xPBNSOeh17ykTgTj0wCrtc78");
const SANDBOX_TIMEOUT_MS = Number(process.env.VERCEL_SANDBOX_TIMEOUT_MS || 45 * 60 * 1000);
const SANDBOX_SNAPSHOT_TTL_MS = Number(process.env.VERCEL_SANDBOX_SNAPSHOT_TTL_MS || 14 * 24 * 60 * 60 * 1000);
const WORKER_DIR = "/vercel/sandbox/rebook-whatsapp-worker";
const DATA_DIR = "/vercel/sandbox/rebook-whatsapp-data";
const WORKER_PORT = 5001;
const WORKER_VERSION = "2026-09-26-sandbox-v2";

let sdkPromise;
let sandboxPromise;

async function getSandboxSdk() {
  if (!sdkPromise) sdkPromise = import("@vercel/sandbox");
  return sdkPromise;
}

function sandboxAuthOptions() {
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
  return token ? { token } : {};
}

function workerEnv() {
  return {
    PORT: String(WORKER_PORT),
    WHATSAPP_BRIDGE_SECRET: String(process.env.WHATSAPP_BRIDGE_SECRET || ""),
    WHATSAPP_DATA_DIR: DATA_DIR,
    WHATSAPP_MAX_SESSIONS: String(process.env.WHATSAPP_MAX_SESSIONS || "2"),
    WHATSAPP_DEFAULT_COUNTRY_CODE: String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91"),
    WHATSAPP_MAX_RECIPIENTS: String(process.env.WHATSAPP_MAX_RECIPIENTS || "100"),
    WHATSAPP_MAX_AUTOMATION_RECIPIENTS: String(process.env.WHATSAPP_MAX_AUTOMATION_RECIPIENTS || "150"),
    AUTOMATION_CALLBACK_SECRET: String(process.env.AUTOMATION_CALLBACK_SECRET || ""),
    NODE_ENV: "production",
  };
}

function readWorkerSource() {
  const indexPath = path.join(__dirname, "..", "whatsapp-worker", "index.cjs");
  const packagePath = path.join(__dirname, "..", "whatsapp-worker", "package.json");
  if (!fs.existsSync(indexPath) || !fs.existsSync(packagePath)) {
    throw new Error("Bundled WhatsApp Sandbox worker files are missing from the deployment.");
  }
  return {
    index: fs.readFileSync(indexPath, "utf8"),
    packageJson: fs.readFileSync(packagePath, "utf8"),
  };
}

async function commandSucceeded(sandbox, cmd, args, options = {}) {
  const result = await sandbox.runCommand({ cmd, args, ...options });
  return result.exitCode === 0;
}

async function writeWorkerFiles(sandbox) {
  const source = readWorkerSource();
  await sandbox.writeFiles([
    { path: path.posix.join(WORKER_DIR, "index.cjs"), content: Buffer.from(source.index) },
    { path: path.posix.join(WORKER_DIR, "package.json"), content: Buffer.from(source.packageJson) },
    { path: path.posix.join(WORKER_DIR, ".worker-version"), content: Buffer.from(WORKER_VERSION + "\n") },
  ]);
}

async function installWorkerDependenciesIfNeeded(sandbox) {
  const packagePath = path.posix.join(WORKER_DIR, "node_modules", "whatsapp-web.js", "package.json");
  const exists = await commandSucceeded(sandbox, "test", ["-f", packagePath], { cwd: WORKER_DIR });
  if (exists) return true;

  await sandbox.runCommand({
    cmd: "sh",
    args: [
      "-lc",
      "npm install --omit=dev --no-audit --no-fund >/tmp/rebook-wa-install.log 2>&1 && node index.cjs >>/tmp/rebook-wa-worker.log 2>&1",
    ],
    cwd: WORKER_DIR,
    env: workerEnv(),
    detached: true,
  });
  return false;
}

async function isWorkerHealthy(sandbox) {
  const result = await sandbox.runCommand({
    cmd: "node",
    args: [
      "-e",
      "fetch('http://127.0.0.1:5001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
    ],
    cwd: WORKER_DIR,
    env: workerEnv(),
  });
  return result.exitCode === 0;
}

async function startWorker(sandbox, dependenciesReady) {
  if (await isWorkerHealthy(sandbox)) return;

  if (dependenciesReady) {
    await sandbox.runCommand({
      cmd: "node",
      args: ["index.cjs"],
      cwd: WORKER_DIR,
      env: workerEnv(),
      detached: true,
    });
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isWorkerHealthy(sandbox)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Vercel Sandbox WhatsApp worker is still starting. Refresh and retry in a few seconds.");
}

async function createOrResumeSandbox() {
  const sdk = await getSandboxSdk();
  const auth = sandboxAuthOptions();
  const options = {
    name: SANDBOX_NAME,
    projectId: SANDBOX_PROJECT_ID,
    teamId: SANDBOX_TEAM_ID,
    persistent: true,
    timeout: SANDBOX_TIMEOUT_MS,
    snapshotExpiration: SANDBOX_SNAPSHOT_TTL_MS,
    resources: { vcpus: Number(process.env.VERCEL_SANDBOX_VCPUS || 4) },
    ports: [WORKER_PORT],
    networkPolicy: "allow-all",
    ...auth,
  };

  return sdk.Sandbox.getOrCreate({
    ...options,
    onCreate: async (sandbox) => {
      await sandbox.runCommand({ cmd: "mkdir", args: ["-p", WORKER_DIR, DATA_DIR] });
      await writeWorkerFiles(sandbox);
      const dependenciesReady = await installWorkerDependenciesIfNeeded(sandbox);
      await startWorker(sandbox, dependenciesReady);
    },
    onResume: async (sandbox) => {
      await sandbox.runCommand({ cmd: "mkdir", args: ["-p", WORKER_DIR, DATA_DIR] });
      await writeWorkerFiles(sandbox);
      const dependenciesReady = await installWorkerDependenciesIfNeeded(sandbox);
      await startWorker(sandbox, dependenciesReady);
    },
  });
}

async function getWhatsAppSandbox() {
  if (!sandboxPromise) {
    sandboxPromise = createOrResumeSandbox().catch((error) => {
      sandboxPromise = null;
      throw error;
    });
  }
  return sandboxPromise;
}

async function getWorkerBaseUrl() {
  const sandbox = await getWhatsAppSandbox();
  return String(sandbox.domain(WORKER_PORT)).replace(/\/$/, "");
}

async function sandboxWorkerFetch(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.WHATSAPP_SANDBOX_REQUEST_TIMEOUT_MS || 15000));

  try {
    const baseUrl = await getWorkerBaseUrl();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", "Bearer " + String(process.env.WHATSAPP_BRIDGE_SECRET || ""));
    headers.set("Content-Type", "application/json");

    const response = await fetch(baseUrl + pathname, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const bodyText = await response.text();
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = { error: bodyText || "Invalid WhatsApp Sandbox worker response." };
    }

    if (!response.ok) {
      const error = new Error(body.error || ("WhatsApp Sandbox worker request failed (" + response.status + ")."));
      error.status = response.status >= 500 ? 503 : response.status;
      throw error;
    }

    return body;
  } catch (error) {
    if (error && error.name === "AbortError") {
      const timeoutError = new Error("Vercel Sandbox WhatsApp worker request timed out.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sandboxWorkerFetch,
  getWhatsAppSandbox,
  getWorkerBaseUrl,
};
