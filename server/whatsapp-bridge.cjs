/**
 * WhatsApp Web Automation Bridge Server for ReBook SaaS Dashboard
 * Powered by whatsapp-web.js + Express
 * 
 * - NO API Keys Required.
 * - Uses your local WhatsApp Web session.
 * - 100% automated background sending with zero keyboard/mouse clicks.
 */

const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const path = require("path");
const os = require("os");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5001;
const AUTH_DIR = path.join(os.homedir(), ".rebook_wwebjs_auth");

app.use(cors());
app.use(express.json());

// State
let client = null;
let qrDataUrl = null;
let qrAscii = null;
let isReady = false;
let clientInfo = null;
let initializationError = null;

// Blast Queue State
let activeBlast = {
  isRunning: false,
  campaignName: "",
  total: 0,
  sentCount: 0,
  failedCount: 0,
  currentIndex: -1,
  results: [], // array of { id, name, phone, status: "pending"|"sending"|"sent"|"failed", error?: string }
  cancelled: false
};

// Initialize WhatsApp Web Client
function initWhatsAppClient() {
  try {
    const { Client, LocalAuth } = require("whatsapp-web.js");

    console.log("🚀 Initializing WhatsApp Web Client at:", AUTH_DIR);
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: AUTH_DIR
      }),
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
          "--disable-extensions"
        ]
      }
    });

    client.on("qr", async (qr) => {
      console.log("\n📱 WhatsApp Web QR Code Received! Scan it with your phone:\n");
      try {
        const qrcodeTerminal = require("qrcode-terminal");
        qrcodeTerminal.generate(qr, { small: true });
      } catch (e) {
        console.log("QR Data:", qr);
      }
      qrAscii = qr;
      try {
        qrDataUrl = await QRCode.toDataURL(qr);
      } catch (err) {
        console.error("Failed to generate QR data URL", err);
      }
      isReady = false;
    });

    client.on("ready", () => {
      isReady = true;
      qrDataUrl = null;
      qrAscii = null;
      clientInfo = client.info;
      console.log("✅ WhatsApp Web Client is READY! Connected as:", client.info?.pushname || "WhatsApp User");
    });

    client.on("authenticated", () => {
      console.log("🔓 WhatsApp Web Authenticated successfully.");
    });

    client.on("auth_failure", (msg) => {
      console.error("❌ Authentication failed:", msg);
      isReady = false;
      initializationError = "Auth failure: " + msg;
    });

    client.on("disconnected", (reason) => {
      console.log("⚠️ WhatsApp Client disconnected:", reason);
      isReady = false;
      clientInfo = null;
    });

    client.initialize().catch((err) => {
      console.error("Error during client.initialize():", err.message);
      initializationError = err.message;
    });

  } catch (err) {
    console.warn("⚠️ whatsapp-web.js or dependencies not installed yet. Run: npm install whatsapp-web.js qrcode express cors");
    initializationError = err.message;
  }
}

// Clean phone number for WhatsApp: only digits + country code (default 91 for 10-digit Indian numbers)
function formatWhatsAppNumber(phone) {
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned; // default India code if 10 digits
  }
  if (cleaned.length < 10 || cleaned.length > 15) {
    throw new Error("A valid phone number with country code is required.");
  }
  return cleaned + "@c.us";
}

// Routes
// 1. Health & Status
app.get("/api/status", (req, res) => {
  res.json({
    online: true,
    isReady,
    hasQr: Boolean(qrDataUrl),
    qrDataUrl,
    clientInfo: isReady ? {
      name: clientInfo?.pushname || "Connected User",
      phone: clientInfo?.wid?.user || "WhatsApp Connected"
    } : null,
    initializationError,
    activeBlast: {
      isRunning: activeBlast.isRunning,
      total: activeBlast.total,
      sentCount: activeBlast.sentCount,
      currentIndex: activeBlast.currentIndex
    }
  });
});

// 2. Start Automated Blast
app.post("/api/blast", async (req, res) => {
  const { recipients, message, campaignName, delayMs = 3000 } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: "Recipients list is required." });
  }

  if (activeBlast.isRunning) {
    return res.status(409).json({ error: "A blast campaign is already in progress." });
  }

  if (!isReady || !client) {
    return res.status(503).json({
      error: "WhatsApp Web is not authenticated yet. Please scan the QR code first."
    });
  }

  // Setup blast state
  activeBlast = {
    isRunning: true,
    campaignName: campaignName || "Automated Blast",
    total: recipients.length,
    sentCount: 0,
    failedCount: 0,
    currentIndex: -1,
    results: recipients.map((r, index) => ({
      id: r.id || index,
      name: r.name,
      phone: r.phone,
      status: "pending",
      error: null
    })),
    cancelled: false
  };

  res.json({
    success: true,
    message: "Automated blast started in the background!",
    total: recipients.length
  });

  // Run the blast loop in the background
  (async () => {
    console.log(`\n🚀 Starting Automated WhatsApp Blast: ${activeBlast.total} recipients`);

    for (let i = 0; i < activeBlast.results.length; i++) {
      if (activeBlast.cancelled) {
        console.log("⏹️ Blast was cancelled by user.");
        break;
      }

      activeBlast.currentIndex = i;
      const target = activeBlast.results[i];
      target.status = "sending";

      // Personalize message: replace {name}
      const firstName = (target.name || "there").split(" ")[0];
      const personalizedMsg = (message || "Hi {name}!").replace(/\{name\}/gi, firstName);

      try {
        const formattedNumber = formatWhatsAppNumber(target.phone);
        console.log(`[${i + 1}/${activeBlast.total}] Sending to ${target.name} (${formattedNumber})...`);

        // Zero keyboard interaction: programmatically delivered by WhatsApp Web client
        await client.sendMessage(formattedNumber, personalizedMsg);

        target.status = "sent";
        activeBlast.sentCount++;
        console.log(`✅ [${i + 1}/${activeBlast.total}] Delivered to ${target.name}!`);
      } catch (err) {
        console.error(`❌ Failed sending to ${target.name}:`, err.message);
        target.status = "failed";
        target.error = err.message || "Failed to send";
        activeBlast.failedCount++;
      }

      // Anti-ban humanized random delay between sends
      if (i < activeBlast.results.length - 1 && !activeBlast.cancelled) {
        const jitter = Math.floor(Math.random() * 1500);
        const waitTime = Math.max(1500, delayMs) + jitter;
        await new Promise((r) => setTimeout(r, waitTime));
      }
    }

    activeBlast.isRunning = false;
    console.log(`🏁 Blast finished! Sent: ${activeBlast.sentCount}, Failed: ${activeBlast.failedCount}\n`);
  })();
});

// 3. Blast Progress
app.get("/api/blast/progress", (req, res) => {
  res.json(activeBlast);
});

// 4. Cancel Blast
app.post("/api/blast/cancel", (req, res) => {
  if (activeBlast.isRunning) {
    activeBlast.cancelled = true;
    return res.json({ success: true, message: "Blast cancellation requested." });
  }
  res.json({ success: true, message: "No active blast was running." });
});

// 5. Send single message
app.post("/api/send-single", async (req, res) => {
  const { phone, message, name } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "Phone and message are required." });
  }

  const firstName = (name || "there").split(" ")[0];
  const personalizedMsg = message.replace(/\{name\}/gi, firstName);
  const formattedNumber = formatWhatsAppNumber(phone);

  try {
    if (!client || !isReady) {
      return res.status(503).json({ error: "WhatsApp Web is not authenticated yet. Please scan the QR code first." });
    }
    await client.sendMessage(formattedNumber, personalizedMsg);
    return res.json({ success: true, message: "Message sent automatically!" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to send message" });
  }
});

// 6. Reset / Disconnect WhatsApp Session (Wipes linked account and local auth data)
app.post(["/api/reset", "/api/logout", "/api/disconnect"], async (req, res) => {
  console.log("🔄 Reset requested: Clearing WhatsApp session and linked credentials...");

  try {
    // 1. Cancel active blast if running
    if (activeBlast.isRunning) {
      activeBlast.cancelled = true;
      activeBlast.isRunning = false;
    }

    // 2. Destroy existing WhatsApp client instance cleanly
    if (client) {
      try {
        await client.logout().catch(() => {});
      } catch (e) {}
      try {
        await client.destroy().catch(() => {});
      } catch (e) {}
      client = null;
    }

    // 3. Reset internal status
    isReady = false;
    clientInfo = null;
    qrDataUrl = null;
    qrAscii = null;
    initializationError = null;
    activeBlast = {
      isRunning: false,
      campaignName: "",
      total: 0,
      sentCount: 0,
      failedCount: 0,
      currentIndex: -1,
      results: [],
      cancelled: false
    };

    // 4. Brief delay to release file locks on Windows
    await new Promise((r) => setTimeout(r, 600));

    // 5. Recursively wipe auth folder
    if (fs.existsSync(AUTH_DIR)) {
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        console.log("🗑️ Deleted WhatsApp auth directory:", AUTH_DIR);
      } catch (fsErr) {
        console.warn("Could not delete entire auth dir immediately:", fsErr.message);
      }
    }

    // 6. Re-initialize a fresh client to generate a new QR code for the user
    setTimeout(() => {
      console.log("🚀 Spawning fresh WhatsApp client instance...");
      initWhatsAppClient();
    }, 500);

    return res.json({
      success: true,
      message: "WhatsApp linked session and credentials deleted successfully. Generating fresh QR code."
    });
  } catch (err) {
    console.error("Error during session reset:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to reset session"
    });
  }
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(` ReBook WhatsApp Automation Bridge (Local Service)`);
  console.log(` Port: http://localhost:${PORT}`);
  console.log(` Status: http://localhost:${PORT}/api/status`);
  console.log(` Zero API Keys needed - direct WhatsApp Web`);
  console.log(`=================================================\n`);

  initWhatsAppClient();
});
