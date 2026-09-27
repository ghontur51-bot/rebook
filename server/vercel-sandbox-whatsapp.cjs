const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const SANDBOX_NAME_PREFIX = String(process.env.REBOOK_SANDBOX_NAME || "rebook-whatsapp");
const SANDBOX_PROJECT_ID = String(process.env.REBOOK_SANDBOX_PROJECT_ID || "").trim();
const SANDBOX_TEAM_ID = String(process.env.REBOOK_SANDBOX_TEAM_ID || "").trim();
const SANDBOX_TIMEOUT_MS = Number(process.env.REBOOK_SANDBOX_TIMEOUT_MS || 45 * 60 * 1000);
const SANDBOX_SNAPSHOT_TTL_MS = Number(process.env.REBOOK_SANDBOX_SNAPSHOT_TTL_MS || 14 * 24 * 60 * 60 * 1000);
const WORKER_DIR = "/vercel/sandbox/rebook-whatsapp-worker";
const DATA_DIR = "/vercel/sandbox/rebook-whatsapp-data";
const WORKER_PORT = 5001;
const WORKER_VERSION = "2026-09-26-sandbox-v3";
function deriveInternalSecret(label) {
  const seed = String(process.env.MASTER_ENCRYPTION_KEY || process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!seed) throw new Error("MASTER_ENCRYPTION_KEY is not configured.");
  return crypto.createHash("sha256").update(seed + ":" + label).digest("hex");
}


let sdkPromise;
const sandboxPromises = new Map();

async function getSandboxSdk() {
  if (!sdkPromise) sdkPromise = import("@vercel/sandbox");
  return sdkPromise;
}

function sandboxAuthOptions() {
  const token = String(process.env.VERCEL_TOKEN || "").trim();
  const projectId = String(
    process.env.REBOOK_SANDBOX_PROJECT_ID ||
    process.env.VERCEL_PROJECT_ID ||
    ""
  ).trim();
  const teamId = String(
    process.env.REBOOK_SANDBOX_TEAM_ID ||
    process.env.VERCEL_TEAM_ID ||
    ""
  ).trim();

  // Sandbox requires token + projectId + teamId as a complete explicit tuple.
  // In Vercel production, omit the tuple and let @vercel/sandbox obtain its
  // short-lived OIDC credentials automatically for the current project.
  if (token && projectId && teamId) {
    return { token, projectId, teamId };
  }

  return {};
}

function workerEnv() {
  return {
    PORT: String(WORKER_PORT),
    WHATSAPP_BRIDGE_SECRET: deriveInternalSecret("rebook-whatsapp-bridge"),
    WHATSAPP_DATA_DIR: DATA_DIR,
    PUPPETEER_CACHE_DIR: path.posix.join(DATA_DIR, "puppeteer-cache"),
    WHATSAPP_MAX_SESSIONS: String(process.env.WHATSAPP_MAX_SESSIONS || "2"),
    WHATSAPP_DEFAULT_COUNTRY_CODE: String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91"),
    WHATSAPP_MAX_RECIPIENTS: String(process.env.WHATSAPP_MAX_RECIPIENTS || "100"),
    WHATSAPP_MAX_AUTOMATION_RECIPIENTS: String(process.env.WHATSAPP_MAX_AUTOMATION_RECIPIENTS || "150"),
    AUTOMATION_CALLBACK_SECRET: deriveInternalSecret("rebook-automation-callback"),
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

// IMPORTANT: this Vercel Function runs with maxDuration 60s (the Hobby/free-plan ceiling).
// Installing the Chromium system libraries (dnf) and the npm dependencies (which pulls
// Puppeteer's bundled Chromium download) reliably takes several minutes on a cold sandbox.
// None of that work may block a request handler, or Vercel kills the invocation long before
// the WhatsApp client can even launch a browser, so the "qr" event never fires. Instead we
// write a single idempotent bootstrap script and launch it fully `detached` so it keeps
// running inside the persistent Sandbox VM regardless of any individual request's lifetime.
// Every request just asks "is it ready yet, and if so, please make sure it's running" —
// none of them wait on the install itself.
const BOOTSTRAP_LOCK = path.posix.join(DATA_DIR, ".bootstrap.lock");
const BOOTSTRAP_DONE = path.posix.join(DATA_DIR, ".bootstrap.done");
const BOOTSTRAP_SCRIPT_PATH = path.posix.join(WORKER_DIR, "bootstrap.sh");

function buildBootstrapScript() {
  return `#!/bin/sh
set -u
cd "${WORKER_DIR}" || exit 1
mkdir -p "${DATA_DIR}"

if [ -f "${BOOTSTRAP_LOCK}" ]; then
  exit 0
fi
touch "${BOOTSTRAP_LOCK}"
trap 'rm -f "${BOOTSTRAP_LOCK}"' EXIT

if [ ! -f "${BOOTSTRAP_DONE}" ]; then
  if ! (ldconfig -p 2>/dev/null | grep -q 'libnss3.so' && ldconfig -p 2>/dev/null | grep -q 'libatk-1.0.so' && ldconfig -p 2>/dev/null | grep -q 'libgtk-3.so'); then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq >>/tmp/rebook-wa-deps.log 2>&1 || exit 1
    apt-get install -y --no-install-recommends \\
      ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 \\
      libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 libfontconfig1 libgbm1 \\
      libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \\
      libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \\
      libxi6 libxkbcommon0 libxrandr2 libxrender1 libxss1 libxtst6 \\
      >>/tmp/rebook-wa-deps.log 2>&1 || exit 1
  fi

  if [ ! -f node_modules/whatsapp-web.js/package.json ]; then
    npm install --omit=dev --no-audit --no-fund >>/tmp/rebook-wa-install.log 2>&1 || exit 1
  fi

  touch "${BOOTSTRAP_DONE}"
fi

rm -f "${BOOTSTRAP_LOCK}"
trap - EXIT

if ! node -e "fetch('http://127.0.0.1:${WORKER_PORT}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
  pkill -f "node index.cjs" >/dev/null 2>&1 || true
  exec node index.cjs >>/tmp/rebook-wa-worker.log 2>&1
fi
`;
}

async function writeWorkerFiles(sandbox) {
  const source = readWorkerSource();
  await sandbox.writeFiles([
    { path: path.posix.join(WORKER_DIR, "index.cjs"), content: Buffer.from(source.index) },
    { path: path.posix.join(WORKER_DIR, "package.json"), content: Buffer.from(source.packageJson) },
    { path: path.posix.join(WORKER_DIR, ".worker-version"), content: Buffer.from(WORKER_VERSION + "\n") },
    { path: BOOTSTRAP_SCRIPT_PATH, content: Buffer.from(buildBootstrapScript()) },
  ]);
}

async function isWorkerHealthy(sandbox) {
  const result = await sandbox.runCommand({
    cmd: "node",
    args: [
      "-e",
      `fetch('http://127.0.0.1:${WORKER_PORT}/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
    ],
    cwd: WORKER_DIR,
    env: workerEnv(),
  });
  return result.exitCode === 0;
}

// Kicks off (or resumes) provisioning without ever blocking the caller. Safe to call on
// every request: if the worker is already healthy this is a fast no-op; if bootstrap is
// already running in the background (lock file present) it's also a fast no-op; only a
// genuinely idle sandbox launches a new detached bootstrap run.
async function launchBootstrapIfNeeded(sandbox) {
  if (await isWorkerHealthy(sandbox)) return;

  const lockPresent = await sandbox.runCommand({ cmd: "test", args: ["-f", BOOTSTRAP_LOCK], cwd: WORKER_DIR });
  if (lockPresent.exitCode === 0) return;

  await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", `sh ${BOOTSTRAP_SCRIPT_PATH} >>/tmp/rebook-wa-bootstrap.log 2>&1`],
    cwd: WORKER_DIR,
    env: workerEnv(),
    sudo: true,
    detached: true,
  });
}

function safeSandboxName(shopId) {
  const id = String(shopId || "").trim();
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) {
    throw new Error("Invalid WhatsApp Sandbox shopId.");
  }
  return (SANDBOX_NAME_PREFIX + "-" + id).slice(0, 250);
}

async function createOrResumeSandbox(shopId) {
  const sdk = await getSandboxSdk();
  const auth = sandboxAuthOptions();
  const options = {
    name: safeSandboxName(shopId),
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
    resume: true,
    onCreate: async (sandbox) => {
      await sandbox.runCommand({ cmd: "mkdir", args: ["-p", WORKER_DIR, DATA_DIR] });
      await writeWorkerFiles(sandbox);
      await launchBootstrapIfNeeded(sandbox);
    },
    onResume: async (sandbox) => {
      await sandbox.runCommand({ cmd: "mkdir", args: ["-p", WORKER_DIR, DATA_DIR] });
      await writeWorkerFiles(sandbox);
      await launchBootstrapIfNeeded(sandbox);
    },
  });
}

async function getWhatsAppSandbox(shopId) {
  const key = String(shopId || "").trim();
  if (!sandboxPromises.has(key)) {
    const promise = createOrResumeSandbox(key).catch((error) => {
      sandboxPromises.delete(key);
      throw error;
    });
    sandboxPromises.set(key, promise);
  }
  return sandboxPromises.get(key);
}

function extractShopId(pathname, options = {}) {
  try {
    if (options.body) {
      const body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;
      if (body?.shopId) return String(body.shopId);
    }
  } catch {}
  try {
    const parsed = new URL("https://sandbox.local" + pathname);
    const shopId = parsed.searchParams.get("shopId");
    if (shopId) return shopId;
  } catch {}
  throw new Error("WhatsApp Sandbox shopId is required.");
}

async function getWorkerBaseUrl(shopId) {
  const sandbox = await getWhatsAppSandbox(shopId);
  // A persistent sandbox may be stopped after its session timeout. Any command
  // automatically resumes it, which also runs the onResume hook to restart the worker.
  await sandbox.runCommand("true", []);
  return String(sandbox.domain(WORKER_PORT)).replace(/\/$/, "");
}

async function sandboxWorkerFetch(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.WHATSAPP_SANDBOX_REQUEST_TIMEOUT_MS || 55000));

  try {
    const shopId = extractShopId(pathname, options);
    const baseUrl = await getWorkerBaseUrl(shopId);
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", "Bearer " + deriveInternalSecret("rebook-whatsapp-bridge"));
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
      let reason = body.error;
      if (reason && typeof reason !== "string") {
        try { reason = JSON.stringify(reason); } catch { reason = String(reason); }
      }
      const error = new Error(reason || ("WhatsApp Sandbox worker request failed (" + response.status + ")."));
      error.status = response.status >= 500 ? 503 : response.status;
      throw error;
    }

    return body;
  } catch (error) {
    const isStatusOrConnect = pathname.startsWith("/api/status") || pathname.startsWith("/api/connect");
    const isConnectionIssue = error?.name === "AbortError" || !error?.status;

    // The worker may simply not be listening yet because bootstrap (dnf/npm install) is
    // still running in the background sandbox — that's expected and can take minutes on a
    // cold start. Surface it as a normal "still starting" state so the UI's existing poll
    // loop keeps waiting instead of showing a hard, retry-button error every few seconds.
    if (isStatusOrConnect && isConnectionIssue) {
      return {
        success: true,
        online: true,
        isReady: false,
        hasQr: false,
        qrDataUrl: null,
        clientInfo: null,
        connectionState: "PROVISIONING",
        initializationError: null,
      };
    }

    if (error && error.name === "AbortError") {
      const timeoutError = new Error("Vercel Sandbox WhatsApp worker is taking too long to start. Please retry in a few seconds.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    if (!error?.status) {
      console.error("Vercel Sandbox WhatsApp worker error:", error);
      const unavailable = new Error("Vercel Sandbox WhatsApp worker is currently unavailable. Please retry.");
      unavailable.status = 503;
      throw unavailable;
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
