const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

try {
  if (typeof process.loadEnvFile === "function") process.loadEnvFile();
} catch (_) {}

const app = express();
const PORT = Number(process.env.WHATSAPP_BRIDGE_PORT || process.env.PORT || 5001);
const AUTH_DIR = path.join(os.homedir(), ".rebook_wwebjs_auth");
const SUPPRESSION_FILE = path.join(AUTH_DIR, "rebook_suppressed_numbers.json");
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8443",
  "http://localhost:5173",
  "http://localhost:4173",
  "https://rebook-rho.vercel.app",
];
const ALLOWED_ORIGINS = String(process.env.REBOOK_WHATSAPP_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const DEFAULT_COUNTRY_CODE = String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "") || "91";
const MAX_RECIPIENTS_PER_BLAST = Math.max(1, Math.min(Number(process.env.WHATSAPP_MAX_RECIPIENTS || 100), 500));
const MAX_MESSAGE_LENGTH = 4096;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "unsub", "opt out", "optout", "remove", "do not message", "don't message"]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by ReBook WhatsApp Bridge."));
  },
  credentials: false,
}));
app.use(express.json({ limit: "256kb" }));

let client = null;
let qrDataUrl = null;
let qrAscii = null;
let isReady = false;
let clientInfo = null;
let initializationError = null;
let connectionState = "UNLAUNCHED";
let suppressedNumbers = new Set();
let recentSends = new Map();

let activeBlast = {
  isRunning: false,
  campaignName: "",
  total: 0,
  sentCount: 0,
  failedCount: 0,
  currentIndex: -1,
  results: [],
  cancelled: false,
};

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function loadSuppressed() {
  ensureAuthDir();
  try {
    const raw = fs.readFileSync(SUPPRESSION_FILE, "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) suppressedNumbers = new Set(list.map((value) => String(value)));
  } catch (_) {
    suppressedNumbers = new Set();
  }
}

function saveSuppressed() {
  ensureAuthDir();
  fs.writeFileSync(SUPPRESSION_FILE, JSON.stringify([...suppressedNumbers].sort(), null, 2), "utf8");
}

function cleanupRecentSends() {
  const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
  for (const [key, time] of recentSends) {
    if (time < cutoff) recentSends.delete(key);
  }
}

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) throw new Error("Phone number is required.");
  if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
  if (digits.length < 11 || digits.length > 15) {
    throw new Error("Use a valid international phone number, including country code.");
  }
  return digits;
}

function jidFromPhone(phone) {
  return normalizePhone(phone) + "@c.us";
}

function assertMessage(message) {
  const text = String(message || "").trim();
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Message is too long. Maximum is ${MAX_MESSAGE_LENGTH} characters.`);
  return text;
}

function assertReady() {
  if (!client || !isReady) throw new Error("WhatsApp is not connected. Start the bridge and scan the QR code first.");
}

function assertBlastPermission(consentConfirmed) {
  if (consentConfirmed !== true) {
    throw new Error("Sending is blocked until you confirm that every recipient has explicitly opted in to receive WhatsApp messages from this business.");
  }
}

function duplicateKey(jid, message) {
  return crypto.createHash("sha256").update(jid + "\0" + message).digest("hex");
}

function registerRecentSend(jid, message) {
  cleanupRecentSends();
  const key = duplicateKey(jid, message);
  const previous = recentSends.get(key);
  if (previous && Date.now() - previous < DUPLICATE_WINDOW_MS) {
    throw new Error("Duplicate message blocked because the same recipient and message were sent recently.");
  }
  recentSends.set(key, Date.now());
}

async function assertRegisteredRecipient(phoneDigits) {
  const id = await client.getNumberId(phoneDigits);
  if (!id) throw new Error("This phone number is not registered on WhatsApp.");
  return id._serialized || String(id);
}

function addSuppression(jid) {
  const normalized = String(jid).replace("@c.us", "");
  if (!normalized) return;
  suppressedNumbers.add(normalized);
  saveSuppressed();
}

function clearRuntimeState() {
  qrDataUrl = null;
  qrAscii = null;
  isReady = false;
  clientInfo = null;
  initializationError = null;
  connectionState = "UNLAUNCHED";
}

async function sendCompliantMessage({ phone, message, name }) {
  assertReady();
  const text = assertMessage(message);
  const phoneDigits = normalizePhone(phone);
  const jid = phoneDigits + "@c.us";

  if (suppressedNumbers.has(phoneDigits)) {
    throw new Error("This recipient is on the WhatsApp suppression list.");
  }

  registerRecentSend(jid, text);
  await assertRegisteredRecipient(phoneDigits);

  const firstName = String(name || "there").trim().split(/\s+/)[0] || "there";
  const personalizedMsg = text.replace(/\{name\}/gi, firstName);

  try {
    const sentMessage = await client.sendMessage(jid, personalizedMsg);
    return {
      messageId: sentMessage?.id?._serialized || null,
      status: "submitted",
      phone: phoneDigits,
    };
  } catch (error) {
    cleanupRecentSends();
    const key = duplicateKey(jid, text);
    recentSends.delete(key);
    throw error;
  }
}

function resetBlastState() {
  activeBlast = {
    isRunning: false,
    campaignName: "",
    total: 0,
    sentCount: 0,
    failedCount: 0,
    currentIndex: -1,
    results: [],
    cancelled: false,
  };
}

function initWhatsAppClient() {
  try {
    const { Client, LocalAuth } = require("whatsapp-web.js");

    ensureAuthDir();
    loadSuppressed();
    clearRuntimeState();

    client = new Client({
      authStrategy: new LocalAuth({ dataPath: AUTH_DIR }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-ipc-flooding-protection",
          "--mute-audio",
          "--disable-extensions",
        ],
      },
    });

    client.on("qr", async (qr) => {
      qrAscii = qr;
      isReady = false;
      connectionState = "PAIRING";
      try {
        qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 });
      } catch (error) {
        initializationError = "Unable to generate pairing QR.";
        console.error(error);
      }
    });

    client.on("authenticated", () => {
      initializationError = null;
    });

    client.on("ready", () => {
      isReady = true;
      connectionState = "CONNECTED";
      qrDataUrl = null;
      qrAscii = null;
      clientInfo = client.info;
      console.log("WhatsApp bridge ready:", client.info?.pushname || "WhatsApp User");
    });

    client.on("change_state", (state) => {
      connectionState = String(state);
      if (state !== "CONNECTED") isReady = false;
    });

    client.on("auth_failure", (message) => {
      isReady = false;
      connectionState = "AUTH_FAILURE";
      initializationError = "WhatsApp authentication failed. Please reset the bridge and scan a new QR code.";
      console.error("WhatsApp auth failure:", message);
    });

    client.on("message", (message) => {
      try {
        if (!message?.from || message.fromMe || !message.body) return;
        const normalized = String(message.body).trim().toLowerCase().replace(/\s+/g, " ");
        if (OPT_OUT_WORDS.has(normalized) || [...OPT_OUT_WORDS].some((word) => normalized === word)) {
          addSuppression(String(message.from));
          console.log("WhatsApp opt-out recorded:", message.from);
        }
      } catch (error) {
        console.warn("Could not process WhatsApp opt-out message:", error.message);
      }
    });

    client.on("disconnected", (reason) => {
      console.warn("WhatsApp disconnected:", reason);
      clearRuntimeState();
      connectionState = String(reason || "DISCONNECTED");
    });

    client.initialize().catch((error) => {
      clearRuntimeState();
      initializationError = error.message || "Unable to initialize WhatsApp Web.";
      console.error("WhatsApp initialize error:", error);
    });
  } catch (error) {
    clearRuntimeState();
    initializationError = error.message || "whatsapp-web.js is not installed.";
    console.error("WhatsApp bridge initialization error:", error);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rebook-whatsapp-bridge", port: PORT });
});

app.get("/api/status", (_req, res) => {
  res.json({
    online: true,
    isReady,
    hasQr: Boolean(qrDataUrl),
    qrDataUrl,
    clientInfo: isReady ? {
      name: clientInfo?.pushname || "Connected User",
      phone: clientInfo?.wid?.user || "WhatsApp Connected",
    } : null,
    connectionState,
    initializationError,
    suppressionCount: suppressedNumbers.size,
    activeBlast: {
      isRunning: activeBlast.isRunning,
      total: activeBlast.total,
      sentCount: activeBlast.sentCount,
      failedCount: activeBlast.failedCount,
      currentIndex: activeBlast.currentIndex,
    },
  });
});

app.get("/api/suppression", (_req, res) => {
  res.json({ count: suppressedNumbers.size });
});

app.post("/api/blast", async (req, res) => {
  const { recipients, message, campaignName, consentConfirmed } = req.body || {};

  try {
    assertBlastPermission(consentConfirmed);
    assertReady();
    const text = assertMessage(message);

    if (!Array.isArray(recipients) || recipients.length === 0) throw new Error("Recipients list is required.");
    if (recipients.length > MAX_RECIPIENTS_PER_BLAST) throw new Error(`This bridge allows at most ${MAX_RECIPIENTS_PER_BLAST} recipients per blast.`);
    if (activeBlast.isRunning) return res.status(409).json({ error: "A blast campaign is already in progress." });

    const seen = new Set();
    const cleanedRecipients = recipients.map((recipient, index) => {
      const phone = normalizePhone(recipient?.phone);
      if (seen.has(phone)) throw new Error(`Duplicate recipient detected: ${phone}.`);
      seen.add(phone);
      return {
        id: recipient?.id ?? index,
        name: String(recipient?.name || "Customer"),
        phone,
        status: "pending",
        error: null,
      };
    });

    resetBlastState();
    activeBlast = {
      isRunning: true,
      campaignName: String(campaignName || "WhatsApp Campaign"),
      total: cleanedRecipients.length,
      sentCount: 0,
      failedCount: 0,
      currentIndex: -1,
      results: cleanedRecipients,
      cancelled: false,
    };

    res.json({ success: true, total: cleanedRecipients.length });

    (async () => {
      for (let index = 0; index < activeBlast.results.length; index += 1) {
        if (activeBlast.cancelled) break;

        const target = activeBlast.results[index];
        activeBlast.currentIndex = index;
        target.status = "sending";

        try {
          const result = await sendCompliantMessage({
            phone: target.phone,
            message: text,
            name: target.name,
          });
          target.status = "sent";
          target.messageId = result.messageId;
          activeBlast.sentCount += 1;
        } catch (error) {
          target.status = "failed";
          target.error = error.message || "Unable to send.";
          activeBlast.failedCount += 1;
        }

        // Fixed operational pacing; this is not intended to bypass platform enforcement.
        if (index < activeBlast.results.length - 1 && !activeBlast.cancelled) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      activeBlast.isRunning = false;
      activeBlast.currentIndex = -1;
    })().catch((error) => {
      activeBlast.isRunning = false;
      console.error("Blast worker failed:", error);
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to start WhatsApp blast." });
  }
});

app.get("/api/blast/progress", (_req, res) => {
  res.json(activeBlast);
});

app.post("/api/blast/cancel", (_req, res) => {
  if (!activeBlast.isRunning) return res.json({ success: true, message: "No active blast was running." });
  activeBlast.cancelled = true;
  res.json({ success: true, message: "Cancellation requested. The current message will finish before the queue stops." });
});

app.post("/api/send-single", async (req, res) => {
  const { phone, message, name, consentConfirmed } = req.body || {};
  try {
    assertReady();
    assertBlastPermission(consentConfirmed);
    const result = await sendCompliantMessage({ phone, message, name });
    res.json({ success: true, ...result });
  } catch (error) {
    const status = String(error.message || "").includes("suppression") ? 409 : 400;
    res.status(status).json({ success: false, error: error.message || "Failed to send message." });
  }
});

app.post("/api/reset", async (_req, res) => {
  try {
    if (activeBlast.isRunning) activeBlast.cancelled = true;

    if (client) {
      try { await client.logout(); } catch (_) {}
      try { await client.destroy(); } catch (_) {}
    }

    client = null;
    resetBlastState();
    clearRuntimeState();

    await new Promise((resolve) => setTimeout(resolve, 600));

    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }

    suppressedNumbers = new Set();
    recentSends = new Map();

    setTimeout(initWhatsAppClient, 700);

    res.json({ success: true, message: "WhatsApp session and local bridge credentials were deleted. A fresh QR will be generated." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to reset WhatsApp bridge." });
  }
});

app.post(["/api/logout", "/api/disconnect"], async (_req, res) => {
  try {
    if (client) {
      try { await client.logout(); } catch (_) {}
    }
    clearRuntimeState();
    resetBlastState();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Failed to disconnect." });
  }
});

const shutdown = async () => {
  try {
    if (client) await client.destroy();
  } catch (_) {}
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.listen(PORT, () => {
  loadSuppressed();
  console.log("=================================================");
  console.log(" ReBook WhatsApp Automation Bridge");
  console.log(` Port: http://localhost:${PORT}`);
  console.log(" Requires explicit WhatsApp opt-in for sending");
  console.log("=================================================");
  initWhatsAppClient();
});
