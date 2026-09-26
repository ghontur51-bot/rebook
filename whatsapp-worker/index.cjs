const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || process.env.WHATSAPP_BRIDGE_PORT || 5001);
const SHARED_SECRET = String(process.env.WHATSAPP_BRIDGE_SECRET || "");
const DATA_DIR = process.env.WHATSAPP_DATA_DIR || "/data/rebook-whatsapp";
const SESSION_DIR = path.join(DATA_DIR, "sessions");
const SUPPRESSION_DIR = path.join(DATA_DIR, "suppression");
const DEFAULT_COUNTRY_CODE = String(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "") || "91";
const MAX_RECIPIENTS_PER_BLAST = Math.max(1, Math.min(Number(process.env.WHATSAPP_MAX_RECIPIENTS || 100), 250));
const MAX_SESSIONS = Math.max(1, Number(process.env.WHATSAPP_MAX_SESSIONS || 2));
const MESSAGE_MAX_LENGTH = 4096;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "unsub", "opt out", "optout", "remove", "do not message", "don't message"]);

const app = express();
app.use(cors({ origin: false }));
app.use(express.json({ limit: "256kb" }));

const sessions = new Map();

function auth(req, res, next) {
  if (!SHARED_SECRET) return res.status(500).json({ error: "WHATSAPP_BRIDGE_SECRET is not configured." });
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(SHARED_SECRET);
  if (!supplied || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized WhatsApp worker request." });
  }
  next();
}

function safeShopId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(id)) throw new Error("Invalid shopId.");
  return id;
}

function sessionPath(shopId) { return path.join(SESSION_DIR, safeShopId(shopId)); }
function suppressionPath(shopId) { return path.join(SUPPRESSION_DIR, `${safeShopId(shopId)}.json`); }

function ensureDirs() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.mkdirSync(SUPPRESSION_DIR, { recursive: true });
}

function loadSuppressed(shopId) {
  try {
    const list = JSON.parse(fs.readFileSync(suppressionPath(shopId), "utf8"));
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSuppressed(shopId, set) {
  ensureDirs();
  fs.writeFileSync(suppressionPath(shopId), JSON.stringify([...set].sort()), "utf8");
}

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) throw new Error("Phone number is required.");
  if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
  if (digits.length < 11 || digits.length > 15) throw new Error("Use a valid international phone number.");
  return digits;
}

function assertMessage(message) {
  const text = String(message || "").trim();
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > MESSAGE_MAX_LENGTH) throw new Error(`Message is too long. Maximum is ${MESSAGE_MAX_LENGTH} characters.`);
  return text;
}

function freshBlast() {
  return {
    isRunning: false,
    campaignName: "",
    total: 0,
    sentCount: 0,
    failedCount: 0,
    currentIndex: -1,
    results: [],
    cancelled: false,
    automation: false,
    callbackUrl: null,
    callbackSecret: null,
    runToken: null,
  };
}

function getSession(shopId) {
  const id = safeShopId(shopId);
  if (!sessions.has(id)) {
    sessions.set(id, {
      shopId: id,
      client: null,
      qrDataUrl: null,
      isReady: false,
      connectionState: "UNLAUNCHED",
      clientInfo: null,
      initializationError: null,
      suppressedNumbers: loadSuppressed(id),
      recentSends: new Map(),
      activeBlast: freshBlast(),
      pendingBlasts: [],
      initializationPromise: null,
    });
  }
  return sessions.get(id);
}

function connectedSessionCount() {
  return [...sessions.values()].filter((s) => s.client && ["DISCONNECTED", "UNLAUNCHED"].indexOf(s.connectionState) === -1).length;
}

async function initializeSession(shopId) {
  const s = getSession(shopId);
  if (s.client || s.initializationPromise) return s;

  if (connectedSessionCount() >= MAX_SESSIONS) {
    s.connectionState = "CAPACITY";
    s.initializationError = `WhatsApp worker capacity reached. Maximum connected sessions: ${MAX_SESSIONS}.`;
    return s;
  }

  s.connectionState = "STARTING";
  s.initializationError = null;
  s.initializationPromise = (async () => {
    const { Client, LocalAuth } = require("whatsapp-web.js");
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: shopId, dataPath: SESSION_DIR }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--disable-background-networking",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-extensions",
          "--mute-audio",
        ],
      },
    });

    s.client = client;

    client.on("qr", async (qr) => {
      s.isReady = false;
      s.connectionState = "PAIRING";
      try {
        s.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 });
        s.initializationError = null;
      } catch (error) {
        s.initializationError = "Unable to generate pairing QR.";
        console.error("QR generation error:", shopId, error);
      }
    });

    client.on("authenticated", () => {
      s.connectionState = "AUTHENTICATED";
      s.initializationError = null;
    });

    client.on("ready", () => {
      s.isReady = true;
      s.connectionState = "CONNECTED";
      s.qrDataUrl = null;
      s.initializationError = null;
      s.clientInfo = client.info ? {
        name: client.info.pushname || "WhatsApp",
        phone: client.info.wid?.user || "",
      } : null;
      console.log(`WhatsApp connected: ${shopId}`);
    });

    client.on("change_state", (nextState) => {
      s.connectionState = String(nextState);
      if (nextState !== "CONNECTED") s.isReady = false;
    });

    client.on("auth_failure", (message) => {
      s.isReady = false;
      s.connectionState = "AUTH_FAILURE";
      s.initializationError = "WhatsApp authentication failed. Reset the session and scan a new QR code.";
      console.error(`WhatsApp auth failure: ${shopId}`, message);
    });

    client.on("message", (message) => {
      try {
        if (!message?.from || message.fromMe || !message.body) return;
        const normalized = String(message.body).trim().toLowerCase().replace(/\s+/g, " ");
        if (OPT_OUT_WORDS.has(normalized)) {
          const phone = String(message.from).replace(/@c.us$/, "");
          s.suppressedNumbers.add(phone);
          saveSuppressed(shopId, s.suppressedNumbers);
        }
      } catch (error) {
        console.warn("Opt-out processing failed:", shopId, error.message);
      }
    });

    client.on("disconnected", (reason) => {
      s.isReady = false;
      s.connectionState = "DISCONNECTED";
      s.clientInfo = null;
      s.qrDataUrl = null;
      s.client = null;
      s.initializationPromise = null;
      console.warn(`WhatsApp disconnected: ${shopId}`, reason);
    });

    await client.initialize();
  })().catch((error) => {
    s.isReady = false;
    s.connectionState = "ERROR";
    s.initializationError = error.message || "Unable to initialize WhatsApp.";
    s.client = null;
    console.error(`WhatsApp initialization failed: ${shopId}`, error);
  }).finally(() => {
    s.initializationPromise = null;
  });

  return s;
}

async function getSessionReady(shopId) {
  const s = getSession(shopId);
  if (!s.client && !s.initializationPromise) await initializeSession(shopId);
  return s;
}

function cleanupRecent(s) {
  const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
  for (const [key, time] of s.recentSends) if (time < cutoff) s.recentSends.delete(key);
}

function assertConsent(consentConfirmed) {
  if (consentConfirmed !== true) throw new Error("Sending is blocked until explicit WhatsApp opt-in is confirmed.");
}

async function notifyAutomationCallback(blast) {
  if (!blast.automation || !blast.callbackUrl || !blast.callbackSecret || !blast.runToken) return;

  const payload = {
    shopId: blast.shopId,
    runToken: blast.runToken,
    campaignName: blast.campaignName,
    sentCount: blast.sentCount,
    failedCount: blast.failedCount,
    cancelled: blast.cancelled,
    results: blast.results.map((result) => ({
      id: result.id,
      status: result.status,
      error: result.error || null,
      messageId: result.messageId || null,
      sentAt: result.sentAt || null,
    })),
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(blast.callbackUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${blast.callbackSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (response.ok) return;
      const body = await response.text().catch(() => "");
      console.error("Automation callback rejected:", blast.shopId, response.status, body);
    } catch (error) {
      console.error("Automation callback failed:", blast.shopId, error.message);
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 2000 : 5000));
    }
  }
}

async function sendOne(shopId, { phone, message, name }) {
  const s = await getSessionReady(shopId);
  if (!s.isReady || !s.client) throw new Error("WhatsApp is not connected. Scan the QR code first.");

  const text = assertMessage(message);
  const phoneDigits = normalizePhone(phone);
  const jid = `${phoneDigits}@c.us`;

  if (s.suppressedNumbers.has(phoneDigits)) throw new Error("Recipient is on the WhatsApp suppression list.");

  cleanupRecent(s);
  const key = crypto.createHash("sha256").update(`${shopId}\0${jid}\0${text}`).digest("hex");
  if (s.recentSends.has(key)) throw new Error("Duplicate message blocked because the same message was recently sent to this recipient.");

  const numberId = await s.client.getNumberId(phoneDigits);
  if (!numberId) throw new Error("This phone number is not registered on WhatsApp.");

  s.recentSends.set(key, Date.now());
  const firstName = String(name || "there").trim().split(/\s+/)[0] || "there";
  const personalized = text.replace(/\{name\}/gi, firstName);

  try {
    const sent = await s.client.sendMessage(jid, personalized);
    return { status: "submitted", messageId: sent?.id?._serialized || null, phone: phoneDigits };
  } catch (error) {
    s.recentSends.delete(key);
    throw error;
  }
}

function publicState(s) {
  return {
    online: true,
    isReady: s.isReady,
    hasQr: Boolean(s.qrDataUrl),
    qrDataUrl: s.qrDataUrl,
    clientInfo: s.clientInfo,
    connectionState: s.connectionState,
    initializationError: s.initializationError,
    suppressionCount: s.suppressedNumbers.size,
    activeBlast: {
      isRunning: s.activeBlast.isRunning,
      total: s.activeBlast.total,
      sentCount: s.activeBlast.sentCount,
      failedCount: s.activeBlast.failedCount,
      currentIndex: s.activeBlast.currentIndex,
      queuedBlasts: s.pendingBlasts.length,
    },
  };
}


async function executeBlast(shopId, s, blast) {
  s.activeBlast = blast;

  try {
    const delayMs = Math.max(
      1000,
      Number(blast.delayMs || (blast.automation ? process.env.WHATSAPP_AUTOMATION_DELAY_MS : process.env.WHATSAPP_MANUAL_DELAY_MS) || (blast.automation ? 2000 : 5000)),
    );

    for (let index = 0; index < s.activeBlast.results.length; index += 1) {
      if (s.activeBlast.cancelled) break;
      const target = s.activeBlast.results[index];
      s.activeBlast.currentIndex = index;
      target.status = "sending";

      try {
        const result = await sendOne(shopId, target);
        target.status = "sent";
        target.messageId = result.messageId;
        target.sentAt = new Date().toISOString();
        s.activeBlast.sentCount += 1;
      } catch (error) {
        target.status = "failed";
        target.error = error.message || "Unable to send.";
        s.activeBlast.failedCount += 1;
      }

      if (index < s.activeBlast.results.length - 1 && !s.activeBlast.cancelled) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } catch (error) {
    console.error("Blast worker error:", shopId, error);
    for (const result of s.activeBlast.results) {
      if (result.status === "pending" || result.status === "sending") {
        result.status = "failed";
        result.error = error.message || "Blast worker error.";
      }
    }
    s.activeBlast.failedCount = s.activeBlast.results.filter((result) => result.status === "failed").length;
  } finally {
    s.activeBlast.isRunning = false;
    s.activeBlast.currentIndex = -1;

    const completedBlast = s.activeBlast;
    if (completedBlast.automation) {
      await notifyAutomationCallback(completedBlast);
    }

    const next = s.pendingBlasts.shift();
    if (next) {
      if (s.isReady && s.client) {
        void executeBlast(shopId, s, next);
      } else {
        next.cancelled = true;
        next.results.forEach((result) => {
          result.status = "failed";
          result.error = "WhatsApp session disconnected before this queued campaign started.";
        });
        await notifyAutomationCallback(next);
        s.activeBlast = freshBlast();
        if (s.pendingBlasts.length) {
          // Continue draining the queue only when the session becomes ready again.
          return;
        }
      }
    } else {
      s.activeBlast = freshBlast();
    }
  }
}

async function cancelPendingBlasts(s, reason) {
  const pending = s.pendingBlasts.splice(0);
  for (const blast of pending) {
    blast.cancelled = true;
    blast.isRunning = false;
    blast.currentIndex = -1;
    for (const result of blast.results) {
      if (result.status === "pending" || result.status === "sending") {
        result.status = "failed";
        result.error = reason;
      }
    }
    if (blast.automation) {
      await notifyAutomationCallback(blast);
    }
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rebook-whatsapp-worker", sessions: sessions.size, maxSessions: MAX_SESSIONS });
});

app.use(auth);

app.get("/api/status", async (req, res) => {
  try {
    const s = await getSessionReady(safeShopId(req.query.shopId));
    res.json(publicState(s));
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to read status." });
  }
});

app.post("/api/connect", async (req, res) => {
  try {
    const s = await getSessionReady(safeShopId(req.body?.shopId));
    res.json({ success: true, ...publicState(s) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || "Unable to connect WhatsApp." });
  }
});

app.post("/api/send-single", async (req, res) => {
  try {
    const { shopId, phone, message, name, consentConfirmed } = req.body || {};
    assertConsent(consentConfirmed);
    const result = await sendOne(shopId, { phone, message, name });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || "Failed to send WhatsApp message." });
  }
});

app.post("/api/blast", async (req, res) => {
  try {
    const { shopId, recipients, message, campaignName, consentConfirmed, automation, callbackUrl, callbackSecret, runToken, delayMs } = req.body || {};
    assertConsent(consentConfirmed);

    if (automation === true) {
      if (!callbackUrl || !callbackSecret || !runToken) throw new Error("Automation callback configuration is incomplete.");
      try {
        const parsed = new URL(String(callbackUrl));
        if (parsed.protocol !== "https:") throw new Error("Automation callback URL must use HTTPS.");
      } catch {
        throw new Error("Automation callback URL is invalid.");
      }
    }

    const s = await getSessionReady(shopId);
    if (!s.isReady) throw new Error("WhatsApp is not connected. Scan the QR code first.");
    if (!Array.isArray(recipients) || recipients.length === 0) throw new Error("Recipients list is required.");

    const automationMax = Math.max(
      MAX_RECIPIENTS_PER_BLAST,
      Math.min(Number(process.env.WHATSAPP_MAX_AUTOMATION_RECIPIENTS || 150), 500),
    );
    const maxRecipients = automation === true ? automationMax : MAX_RECIPIENTS_PER_BLAST;
    if (recipients.length > maxRecipients) {
      throw new Error(`This worker allows at most ${maxRecipients} recipients per campaign.`);
    }

    const seen = new Set();
    const queue = recipients.map((recipient, index) => {
      const phone = normalizePhone(recipient?.phone);
      if (seen.has(phone)) throw new Error(`Duplicate recipient detected: ${phone}.`);
      seen.add(phone);
      return {
        id: recipient?.id ?? index,
        name: String(recipient?.name || "Customer"),
        phone,
        message: String(recipient?.message || message || ""),
        status: "pending",
        error: null,
      };
    }).filter((recipient) => !s.suppressedNumbers.has(recipient.phone));

    if (!queue.length) throw new Error("No eligible recipients remain after WhatsApp opt-out filtering.");

    const blast = {
      isRunning: true,
      campaignName: String(campaignName || "WhatsApp Campaign"),
      total: queue.length,
      sentCount: 0,
      failedCount: 0,
      currentIndex: -1,
      results: queue,
      cancelled: false,
      automation: automation === true,
      callbackUrl: automation === true ? String(callbackUrl) : null,
      callbackSecret: automation === true ? String(callbackSecret) : null,
      runToken: automation === true ? String(runToken) : null,
      delayMs: Number(delayMs || 0) || null,
      shopId,
    };

    if (s.activeBlast.isRunning) {
      if (automation !== true) {
        return res.status(409).json({ error: "A WhatsApp campaign is already running for this shop." });
      }

      s.pendingBlasts.push(blast);
      return res.json({
        success: true,
        total: queue.length,
        queued: true,
        queuePosition: s.pendingBlasts.length,
      });
    }

    res.json({ success: true, total: queue.length, queued: false });
    void executeBlast(shopId, s, blast);
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to start campaign." });
  }
});

app.get("/api/blast/progress", async (req, res) => {
  try {
    const s = getSession(safeShopId(req.query.shopId));
    res.json(s.activeBlast);
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to read campaign progress." });
  }
});

app.post("/api/blast/cancel", async (req, res) => {
  try {
    const s = getSession(safeShopId(req.body?.shopId));
    s.activeBlast.cancelled = true;
    await cancelPendingBlasts(s, "Campaign cancelled before this queued batch started.");
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || "Unable to cancel campaign." });
  }
});

app.post("/api/reset", async (req, res) => {
  try {
    const shopId = safeShopId(req.body?.shopId);
    const s = getSession(shopId);
    s.activeBlast.cancelled = true;
    await cancelPendingBlasts(s, "WhatsApp session was reset before this queued batch started.");

    if (s.client) {
      try { await s.client.logout(); } catch (_) {}
      try { await s.client.destroy(); } catch (_) {}
    }

    sessions.delete(shopId);
    fs.rmSync(sessionPath(shopId), { recursive: true, force: true });
    fs.rmSync(suppressionPath(shopId), { force: true });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Unable to reset WhatsApp session." });
  }
});

app.post("/api/disconnect", async (req, res) => {
  try {
    const shopId = safeShopId(req.body?.shopId);
    const s = getSession(shopId);
    s.activeBlast.cancelled = true;
    await cancelPendingBlasts(s, "WhatsApp session disconnected before this queued batch started.");

    if (s.client) {
      try { await s.client.logout(); } catch (_) {}
      try { await s.client.destroy(); } catch (_) {}
    }

    sessions.delete(shopId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || "Unable to disconnect." });
  }
});

async function bootExistingSessions() {
  ensureDirs();
  let entries = [];
  try {
    entries = fs.readdirSync(SESSION_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {}

  for (const shopId of entries.slice(0, MAX_SESSIONS)) {
    try {
      await initializeSession(shopId);
    } catch (error) {
      console.error("Boot session failed:", shopId, error);
    }
  }
}

app.listen(PORT, async () => {
  ensureDirs();
  console.log(`ReBook WhatsApp worker listening on port ${PORT}`);
  console.log(`Max concurrent WhatsApp sessions: ${MAX_SESSIONS}`);
  await bootExistingSessions();
});
