const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const QRCode = require('qrcode');
const path = require('path');

try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
} catch (_) {}

const app = express();
const allowedOrigins = String(process.env.REBOOK_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by ReBook API.'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { if (req.originalUrl === '/api/razorpay/webhook') req.rawBody = Buffer.from(buf); } }));

const PORT = Number(process.env.REBOOK_API_PORT || process.env.API_PORT || 5000);
const APP_BASE_URL = (process.env.APP_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(/\/$/, '');
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || '';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const MASTER_ENCRYPTION_KEY = process.env.MASTER_ENCRYPTION_KEY || '';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const WHATSAPP_BRIDGE_BASE_URL = String(process.env.WHATSAPP_BRIDGE_BASE_URL || '').replace(/\/$/, '');
const WHATSAPP_BRIDGE_SECRET = String(process.env.WHATSAPP_BRIDGE_SECRET || '');
const DEMO_WHATSAPP_PIN = String(process.env.DEMO_WHATSAPP_PIN || '');
const DEMO_WHATSAPP_SHOP_ID = String(process.env.DEMO_WHATSAPP_SHOP_ID || 'demo_whatsapp_test');
const AUTOMATION_CALLBACK_SECRET = String(process.env.AUTOMATION_CALLBACK_SECRET || '');

const CENTRAL_SERVICE_ACCOUNT_JSON = process.env.CENTRAL_FIREBASE_SERVICE_ACCOUNT_JSON || '';
const CENTRAL_PROJECT_ID = process.env.CENTRAL_FIREBASE_PROJECT_ID || '';
const CENTRAL_CLIENT_EMAIL = process.env.CENTRAL_FIREBASE_CLIENT_EMAIL || '';
const CENTRAL_PRIVATE_KEY = process.env.CENTRAL_FIREBASE_PRIVATE_KEY || '';

const SHOP_COLLECTIONS = [
  'customers', 'bookings', 'automations', 'campaigns', 'messages', 'staff', 'automationRuns', 'visits', 'automationScheduler'
];

const tokenCache = new Map();
const serviceAppCache = new Map();
const adminLoginBuckets = new Map();

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function checkAdminLoginRateLimit(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 12;
  const key = String(ip || 'unknown');
  const existing = adminLoginBuckets.get(key);
  const bucket = existing && now - existing.windowStart < windowMs
    ? existing
    : { windowStart: now, count: 0 };
  bucket.count += 1;
  adminLoginBuckets.set(key, bucket);
  if (bucket.count > maxAttempts) fail(429, 'Too many login attempts. Please try again later.');
}

function jsonOrUndefined(raw, label) {
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { fail(500, `${label} is not valid JSON.`); }
}

function getCentralServiceAccount() {
  const fromJson = jsonOrUndefined(CENTRAL_SERVICE_ACCOUNT_JSON, 'CENTRAL_FIREBASE_SERVICE_ACCOUNT_JSON');
  const projectId = fromJson?.project_id || CENTRAL_PROJECT_ID;
  const clientEmail = fromJson?.client_email || CENTRAL_CLIENT_EMAIL;
  const privateKey = (fromJson?.private_key || CENTRAL_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    fail(500, 'Central Firebase service account is not configured.');
  }
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}

function normalizeFirebasePrivateKey(rawKey) {
  let key = String(rawKey || '').replace(/^\uFEFF/, '').trim();

  // Firebase service-account JSON normally stores newlines as \\n.
  // Convert escaped line breaks and Windows line endings into a canonical PEM.
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Be tolerant if someone pasted an extra pair of quotes around the PEM.
  if ((key.startsWith('\"') && key.endsWith('\"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  if (!key.includes('-----BEGIN ') || !key.includes('-----END ')) {
    fail(400, 'Firebase service account private_key is not a valid PEM key. Download a fresh service-account JSON key from Firebase and paste the complete JSON.');
  }

  try {
    const keyObject = crypto.createPrivateKey({ key, format: 'pem' });
    return keyObject.export({ format: 'pem', type: 'pkcs8' }).toString();
  } catch (_) {
    fail(400, 'Firebase service account private_key could not be parsed. Use the complete private_key from a freshly downloaded Firebase service-account JSON file.');
  }
}

function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

function getEncryptionKey() {
  if (!/^[0-9a-fA-F]{64}$/.test(MASTER_ENCRYPTION_KEY)) {
    fail(500, 'MASTER_ENCRYPTION_KEY must be a 64-character hex string.');
  }
  return Buffer.from(MASTER_ENCRYPTION_KEY, 'hex');
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, alg: 'aes-256-gcm', iv: iv.toString('base64url'), tag: tag.toString('base64url'), data: ciphertext.toString('base64url') };
}

function decryptSecret(payload) {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64url')), decipher.final()]).toString('utf8');
}

function baseUrlFromReq(req) {
  if (APP_BASE_URL) return APP_BASE_URL.replace(/\/$/, '');
  if (!req) {
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'http://localhost:5000';
  }
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = req.get('host');
  return `${proto}://${host}`;
}

function signAdminToken(payload) {
  if (!ADMIN_SESSION_SECRET) fail(500, 'ADMIN_SESSION_SECRET is not configured.');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || !ADMIN_SESSION_SECRET) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(parts[0]).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[1]))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload.role === 'superadmin' && Date.now() - Number(payload.iat || 0) < 8 * 60 * 60 * 1000;
  } catch { return false; }
}

function requireAdmin(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verifyAdminToken(token)) return res.status(401).json({ error: 'Unauthorized.' });
  next();
}

async function googleAccessToken(serviceAccount) {
  const cacheKey = serviceAccount.client_email;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');
  const unsigned = `${header}.${claim}`;
  const privateKey = normalizeFirebasePrivateKey(serviceAccount.private_key);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64url');
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!response.ok) {
    const raw = await response.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = [parsed.error, parsed.error_description].filter(Boolean).join(': ') || raw;
    } catch (_) {}
    fail(502, `Google authentication failed (${response.status}): ${detail}`);
  }
  const data = await response.json();
  tokenCache.set(cacheKey, { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 });
  return data.access_token;
}

function fsValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsValue) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fsValue(v)])) } };
  return { stringValue: String(value) };
}

function fromFsValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFsValue(x)]));
  return null;
}

function firestoreBase(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

async function firestoreFetch(serviceAccount, method, url, body) {
  const token = await googleAccessToken(serviceAccount);
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    const message = data?.error?.message || `Firestore request failed (${response.status}).`;
    fail(response.status >= 500 ? 502 : response.status, message);
  }
  return data;
}

async function listDocuments(serviceAccount, projectId, collection) {
  const all = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const data = await firestoreFetch(serviceAccount, 'GET', `${firestoreBase(projectId)}/${encodeURIComponent(collection)}?${query.toString()}`);
    for (const doc of data.documents || []) {
      const fields = Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fromFsValue(v)]));
      const id = doc.name.split('/').pop();
      all.push({ ...fields, __docId: id });
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all;
}

function firestoreDocumentPath(projectId, collection, id) {
  return `projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`;
}

function docName(projectId, collection, id) {
  return `${firestoreBase(projectId)}/${encodeURIComponent(collection)}/${encodeURIComponent(String(id))}`;
}

async function commitWrites(serviceAccount, projectId, writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;
  for (let i = 0; i < writes.length; i += 450) {
    const chunk = writes.slice(i, i + 450);
    await firestoreFetch(serviceAccount, 'POST', url, { writes: chunk });
  }
}

function makeUpdateWrite(projectId, collection, id, data) {
  const safe = { ...data };
  delete safe.__docId;
  return { update: { name: firestoreDocumentPath(projectId, collection, id), fields: Object.fromEntries(Object.entries(safe).map(([k, v]) => [k, fsValue(v)])) } };
}

function makeDeleteWrite(projectId, collection, id) {
  return { delete: firestoreDocumentPath(projectId, collection, id) };
}

async function ensureCentralShopAccess() {
  const central = getCentralServiceAccount();
  return { serviceAccount: central, projectId: central.project_id };
}

async function getCentralDoc(collection, id) {
  const { serviceAccount, projectId } = await ensureCentralShopAccess();
  try {
    const data = await firestoreFetch(serviceAccount, 'GET', docName(projectId, collection, id));
    return Object.fromEntries(Object.entries(data.fields || {}).map(([k, v]) => [k, fromFsValue(v)]));
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function setCentralDoc(collection, id, data) {
  const { serviceAccount, projectId } = await ensureCentralShopAccess();
  await commitWrites(serviceAccount, projectId, [makeUpdateWrite(projectId, collection, id, data)]);
}

async function listCentral(collection) {
  const { serviceAccount, projectId } = await ensureCentralShopAccess();
  return listDocuments(serviceAccount, projectId, collection);
}

async function getShopRecord(shopId) {
  return getCentralDoc('shops', shopId);
}

async function getShopFirebase(shop) {
  if (!shop?.firebaseServiceAccountEncrypted) fail(500, 'Shop Firebase credentials are missing.');
  const raw = decryptSecret(shop.firebaseServiceAccountEncrypted);
  const serviceAccount = JSON.parse(raw);
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) fail(500, 'Stored shop Firebase service account is invalid.');
  return { serviceAccount, projectId: serviceAccount.project_id };
}

async function shopSnapshot(shop) {
  const { serviceAccount, projectId } = await getShopFirebase(shop);
  const [customers, bookings, automations, campaigns, messages, staff, automationRuns, visits, schedulerDocs, salonDocs, notificationDocs] = await Promise.all([
    listDocuments(serviceAccount, projectId, 'customers'),
    listDocuments(serviceAccount, projectId, 'bookings'),
    listDocuments(serviceAccount, projectId, 'automations'),
    listDocuments(serviceAccount, projectId, 'messages'),
    listDocuments(serviceAccount, projectId, 'staff'),
    listDocuments(serviceAccount, projectId, 'automationRuns'),
    listDocuments(serviceAccount, projectId, 'visits'),
    listDocuments(serviceAccount, projectId, 'automationScheduler'),
    listDocuments(serviceAccount, projectId, 'salon'),
    listDocuments(serviceAccount, projectId, 'notifications'),
  ]);
  const strip = rows => rows.map(({ __docId, ...x }) => x);
  const visitHistory = {};
  for (const row of visits) {
    const id = row.__docId;
    visitHistory[id] = row.records || [];
  }
  return {
    customers: strip(customers),
    bookings: strip(bookings),
    automations: strip(automations),
    campaigns: strip(campaigns),
    messages: strip(messages),
    staff: strip(staff),
    automationRuns: strip(automationRuns),
    automationScheduler: schedulerDocs[0] ? (() => { const { __docId, ...x } = schedulerDocs[0]; return x; })() : null,
    visitHistory,
    salon: salonDocs[0] ? (() => { const { __docId, ...x } = salonDocs[0]; return x; })() : null,
    notifications: notificationDocs[0] ? (() => { const { __docId, ...x } = notificationDocs[0]; return x; })() : null,
  };
}

function hashEqual(a, b) {
  const ah = Buffer.from(sha256(a), 'hex');
  const bh = Buffer.from(sha256(b), 'hex');
  return ah.length === bh.length && crypto.timingSafeEqual(ah, bh);
}

async function whatsappBridgeFetch(pathname, options = {}) {
  if (!WHATSAPP_BRIDGE_BASE_URL || !WHATSAPP_BRIDGE_SECRET) {
    fail(503, 'WhatsApp worker is not configured.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.WHATSAPP_BRIDGE_TIMEOUT_MS || 12000));
  try {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${WHATSAPP_BRIDGE_SECRET}`);
    headers.set('Content-Type', 'application/json');
    const response = await fetch(`${WHATSAPP_BRIDGE_BASE_URL}${pathname}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const bodyText = await response.text();
    let body = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { error: bodyText || 'Invalid worker response.' }; }
    if (!response.ok) fail(response.status >= 500 ? 503 : response.status, body.error || 'WhatsApp worker request failed.');
    return body;
  } catch (error) {
    if (error.name === 'AbortError') fail(504, 'WhatsApp worker request timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requireDemoWhatsApp(req, res, next) {
  if (!DEMO_WHATSAPP_PIN) return res.status(404).json({ error: 'Demo WhatsApp testing is disabled.' });
  const supplied = String(req.headers['x-demo-whatsapp-pin'] || '');
  if (!supplied || supplied !== DEMO_WHATSAPP_PIN) return res.status(401).json({ error: 'Invalid demo WhatsApp PIN.' });
  next();
}

async function demoWhatsAppProxy(pathname, options = {}) {
  return whatsappBridgeFetch(pathname, options);
}

async function requireShopAccess(req, res, next) {
  try {
    const shopId = req.params.shopId;
    const token = String(req.headers['x-shop-access-token'] || '');
    const shop = await getShopRecord(shopId);
    if (!shop || shop.deletedAt) return res.status(404).json({ error: 'Shop not found.' });
    if (!token || !shop.accessTokenHash || !hashEqual(token, shop.accessTokenHash)) return res.status(401).json({ error: 'Invalid shop access token.' });
    await ensureBillingState(shopId);
    const refreshed = await getShopRecord(shopId);
    if (!refreshed || refreshed.status !== 'active') return res.status(423).json({ error: 'Shop access is frozen.', shop: publicShop(refreshed) });
    req.shop = refreshed;
    next();
  } catch (error) {
    next(error);
  }
}

function publicShop(shop) {
  if (!shop) return null;
  return {
    shopId: shop.shopId,
    shopName: shop.shopName,
    ownerName: shop.ownerName,
    ownerEmail: shop.ownerEmail,
    address: shop.address,
    phone: shop.phone,
    price: Number(shop.price || 0),
    currency: shop.currency || 'INR',
    status: shop.status || 'pending',
    billingStart: shop.billingStart || null,
    billingEnd: shop.billingEnd || null,
    renewalCycleId: shop.currentCycleId || null,
    renewalQrDataUrl: shop.renewalQrDataUrl || null,
    renewalUrl: shop.renewalUrl || null,
  };
}

async function createQrForCycle(req, shopId, cycleId) {
  const url = `${baseUrlFromReq(req)}/pay/${encodeURIComponent(shopId)}/${encodeURIComponent(cycleId)}`;
  return { url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 320 }) };
}

async function getBillingCycle(cycleId) { return getCentralDoc('billingCycles', cycleId); }
async function setBillingCycle(cycleId, data) { return setCentralDoc('billingCycles', cycleId, data); }

function addDays(date, days) { return new Date(date.getTime() + days * 86400000); }

async function ensureBillingState(shopId, req) {
  const shop = await getShopRecord(shopId);
  if (!shop || shop.deletedAt) return null;
  if (shop.status === 'active' && shop.billingEnd && Date.now() >= new Date(shop.billingEnd).getTime()) {
    const existingCycle = shop.currentCycleId ? await getBillingCycle(shop.currentCycleId) : null;
    if (!existingCycle || existingCycle.status === 'paid') {
      const cycleId = `cycle_${shopId}_${Date.now()}`;
      const qr = await createQrForCycle(req, shopId, cycleId);
      const cycle = {
        cycleId,
        shopId,
        amount: Number(shop.price || 0),
        currency: shop.currency || 'INR',
        status: 'pending',
        createdAt: new Date().toISOString(),
        dueAt: new Date().toISOString(),
        qrUrl: qr.url,
        qrDataUrl: qr.qrDataUrl,
        razorpayOrderId: null,
        razorpayPaymentId: null,
      };
      await setBillingCycle(cycleId, cycle);
      await setCentralDoc('shops', shopId, {
        ...shop,
        status: 'frozen',
        currentCycleId: cycleId,
        renewalQrDataUrl: qr.qrDataUrl,
        renewalUrl: qr.url,
        updatedAt: new Date().toISOString(),
      });
      return cycle;
    }
  }
  return shop.currentCycleId ? getBillingCycle(shop.currentCycleId) : null;
}


const DEFAULT_AUTOMATION_SCHEDULE = {
  enabled: true,
  runHour: 23,
  timezone: 'Asia/Kolkata',
  lastRunDate: null,
  lastRunAt: null,
  lastRunStatus: 'never',
  lastRunSummary: null,
};

function normalizeAutomationSchedule(value) {
  const runHour = Number(value?.runHour);
  const timezone = String(value?.timezone || DEFAULT_AUTOMATION_SCHEDULE.timezone);
  return {
    ...DEFAULT_AUTOMATION_SCHEDULE,
    ...(value || {}),
    enabled: value?.enabled !== false,
    runHour: Number.isInteger(runHour) && runHour >= 0 && runHour <= 23 ? runHour : DEFAULT_AUTOMATION_SCHEDULE.runHour,
    timezone,
  };
}

function getLocalDateParts(date, timezone) {
  const safeTimezone = String(timezone || 'Asia/Kolkata');
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
    };
  } catch (_) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
    };
  }
}

function dateKeyFromParts(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function calendarDaysBetween(a, b) {
  const aUtc = Date.UTC(a.year, a.month - 1, a.day);
  const bUtc = Date.UTC(b.year, b.month - 1, b.day);
  return Math.floor((bUtc - aUtc) / 86400000);
}

function parseDateParts(value, timezone) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function addCalendarMonths(parts, months) {
  const firstOfTarget = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return {
    year: targetYear,
    month: targetMonth,
    day: Math.min(parts.day, lastDay),
  };
}

function automationRuleThresholdReached(customer, trigger, now, timezone) {
  const triggerLower = String(trigger || '').toLowerCase();
  if (triggerLower.includes('5,000')) return false;
  const lastVisit = parseDateParts(customer.lastVisit, timezone);
  if (!lastVisit) return false;
  const today = getLocalDateParts(now, timezone);

  if (triggerLower.includes('3 months')) {
    const target = addCalendarMonths(lastVisit, 3);
    return calendarDaysBetween(target, today) >= 0;
  }
  if (triggerLower.includes('6 months')) {
    const target = addCalendarMonths(lastVisit, 6);
    return calendarDaysBetween(target, today) >= 0;
  }
  if (triggerLower.includes('30 days')) return calendarDaysBetween(lastVisit, today) >= 30;
  if (triggerLower.includes('60 days')) return calendarDaysBetween(lastVisit, today) >= 60;
  if (triggerLower.includes('90 days')) return calendarDaysBetween(lastVisit, today) >= 90;
  if (triggerLower.includes('1 day after')) return calendarDaysBetween(lastVisit, today) >= 1;
  return false;
}

function automationDedupeKey(auto, customer) {
  return `${auto.id}:${customer.id}:visit:${customer.lastVisit || 'unknown'}`;
}

function personalizeAutomationMessage(auto, customer) {
  const firstName = String(customer.name || 'there').trim().split(/\s+/)[0] || 'there';
  return String(auto.message || '').replace(/\{name\}/gi, firstName);
}

function successfulAutomationRun(run) {
  return run?.status === 'queued' || run?.status === 'sent' || run?.status === 'recorded';
}

function automationStatsFor(auto, runs) {
  const matched = runs.filter((run) => Number(run.automationId) === Number(auto.id) && successfulAutomationRun(run));
  const converted = matched.filter((run) => run.bookingId !== undefined).length;
  return {
    ...auto,
    triggered: matched.length,
    converted,
    conversionRate: matched.length ? Number(((converted / matched.length) * 100).toFixed(1)) : 0,
    triggeredCustomerIds: [...new Set(matched.map((run) => Number(run.customerId)))],
  };
}

async function runScheduledAutomationsForShop(shop, now = new Date()) {
  const schedule = normalizeAutomationSchedule((await getShopAutomationScheduler(shop)) || {});
  const localNow = getLocalDateParts(now, schedule.timezone);
  const dayKey = dateKeyFromParts(localNow);

  if (!schedule.enabled) return { shopId: shop.shopId, status: 'disabled', eligible: 0, queued: 0, failed: 0 };
  if (localNow.hour !== schedule.runHour) return { shopId: shop.shopId, status: 'not-due', eligible: 0, queued: 0, failed: 0 };
  if (schedule.lastRunDate === dayKey) return { shopId: shop.shopId, status: 'already-ran', eligible: 0, queued: 0, failed: 0 };

  const { serviceAccount, projectId } = await getShopFirebase(shop);
  const [customers, automations, automationRuns] = await Promise.all([
    listDocuments(serviceAccount, projectId, 'customers'),
    listDocuments(serviceAccount, projectId, 'automations'),
    listDocuments(serviceAccount, projectId, 'automationRuns'),
  ]);

  const eligible = [];
  let skippedNoConsent = 0;
  for (const auto of automations.filter((item) => item.status === 'active' && String(item.action || '').toLowerCase().includes('whatsapp'))) {
    if (String(auto.trigger || '').toLowerCase().includes('5,000')) continue;
    for (const customer of customers) {
      if (customer.whatsappOptIn !== true) {
        skippedNoConsent += 1;
        continue;
      }
      if (!/^\d{10}$/.test(String(customer.phone || '').replace(/\D/g, '').slice(-10))) continue;
      if (!automationRuleThresholdReached(customer, auto.trigger, now, schedule.timezone)) continue;

      const dedupeKey = automationDedupeKey(auto, customer);
      if (automationRuns.some((run) => run.dedupeKey === dedupeKey && successfulAutomationRun(run))) continue;

      eligible.push({
        automationId: Number(auto.id),
        customerId: Number(customer.id),
        phone: customer.phone,
        name: customer.name,
        message: personalizeAutomationMessage(auto, customer),
        dedupeKey,
      });
    }
  }

  if (!eligible.length) {
    const updatedSchedule = {
      ...schedule,
      lastRunDate: dayKey,
      lastRunAt: now.toISOString(),
      lastRunStatus: 'success',
      lastRunSummary: { eligible: 0, queued: 0, failed: 0 },
    };
    await setShopAutomationScheduler(shop, updatedSchedule);
    return { shopId: shop.shopId, status: 'success', eligible: 0, queued: 0, failed: 0, skippedNoConsent };
  }

  if (!AUTOMATION_CALLBACK_SECRET) {
    const failedSchedule = {
      ...schedule,
      lastRunAt: now.toISOString(),
      lastRunStatus: 'failed',
      lastRunSummary: { eligible: eligible.length, queued: 0, failed: eligible.length },
    };
    await setShopAutomationScheduler(shop, failedSchedule);
    return { shopId: shop.shopId, status: 'failed', eligible: eligible.length, queued: 0, failed: eligible.length, error: 'AUTOMATION_CALLBACK_SECRET is not configured.' };
  }

  const runToken = sha256(`${shop.shopId}|${dayKey}|${now.toISOString()}|${crypto.randomBytes(16).toString('hex')}`);
  const callbackUrl = `${baseUrlFromReq(null)}/api/internal/automation-blast-result`;

  try {
    await whatsappBridgeFetch('/api/blast', {
      method: 'POST',
      body: JSON.stringify({
        shopId: shop.shopId,
        recipients: eligible.map((item) => ({
          id: `${item.automationId}-${item.customerId}`,
          name: item.name,
          phone: item.phone,
          message: item.message,
        })),
        message: eligible[0].message,
        campaignName: 'Scheduled Customer Automations',
        consentConfirmed: true,
        automation: true,
        callbackUrl,
        callbackSecret: AUTOMATION_CALLBACK_SECRET,
        runToken,
      }),
    });
  } catch (error) {
    const failedSchedule = {
      ...schedule,
      lastRunAt: now.toISOString(),
      lastRunStatus: 'failed',
      lastRunSummary: { eligible: eligible.length, queued: 0, failed: eligible.length },
    };
    await setShopAutomationScheduler(shop, failedSchedule);
    return { shopId: shop.shopId, status: 'failed', eligible: eligible.length, queued: 0, failed: eligible.length, error: error.message };
  }

  const newRuns = eligible.map((item) => ({
    automationId: item.automationId,
    customerId: item.customerId,
    triggeredAt: now.toISOString(),
    status: 'queued',
    dedupeKey: item.dedupeKey,
    runToken,
    messageText: item.message,
  }));

  const mergedRuns = [...automationRuns, ...newRuns];
  const writes = [
    ...newRuns.map((run) => makeUpdateWrite(projectId, 'automationRuns', sha256(`${run.dedupeKey}|${run.triggeredAt}`), run)),
    ...automations.map((auto) => makeUpdateWrite(projectId, 'automations', auto.__docId || auto.id, automationStatsFor(auto, mergedRuns))),
    makeUpdateWrite(projectId, 'automationScheduler', 'current', {
      ...schedule,
      lastRunDate: dayKey,
      lastRunAt: now.toISOString(),
      lastRunStatus: 'success',
      lastRunSummary: { eligible: eligible.length, queued: eligible.length, failed: 0 },
    }),
  ];
  await commitWrites(serviceAccount, projectId, writes);

  return { shopId: shop.shopId, status: 'success', eligible: eligible.length, queued: eligible.length, failed: 0, skippedNoConsent };
}

async function getShopAutomationScheduler(shop) {
  const { serviceAccount, projectId } = await getShopFirebase(shop);
  const docs = await listDocuments(serviceAccount, projectId, 'automationScheduler');
  return docs[0] || null;
}

async function setShopAutomationScheduler(shop, schedule) {
  const { serviceAccount, projectId } = await getShopFirebase(shop);
  await commitWrites(serviceAccount, projectId, [
    makeUpdateWrite(projectId, 'automationScheduler', 'current', schedule),
  ]);
}

async function processAutomationBlastResult(payload) {
  const shopId = String(payload?.shopId || '').trim();
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(shopId)) fail(400, 'Invalid shopId.');
  const runToken = String(payload?.runToken || '').trim();
  const results = Array.isArray(payload?.results) ? payload.results : [];
  if (!runToken) fail(400, 'runToken is required.');

  const shop = await getShopRecord(shopId);
  if (!shop || shop.deletedAt) fail(404, 'Shop not found.');
  const { serviceAccount, projectId } = await getShopFirebase(shop);
  const [runs, automations] = await Promise.all([
    listDocuments(serviceAccount, projectId, 'automationRuns'),
    listDocuments(serviceAccount, projectId, 'automations'),
  ]);

  const resultById = new Map(results.map((result) => [String(result?.id), result]));
  const relevant = runs.filter((run) => run.runToken === runToken);
  if (!relevant.length) {
    return { shopId, updated: 0, sent: 0, failed: 0, status: 'ignored' };
  }

  const now = new Date().toISOString();
  const updatedRuns = runs.map((run) => {
    if (run.runToken !== runToken) return run;
    const result = resultById.get(`${run.automationId}-${run.customerId}`);
    if (result?.status === 'sent') {
      return { ...run, status: 'sent', sentAt: result.sentAt || now };
    }
    if (result?.status === 'failed') {
      return { ...run, status: 'failed', failedAt: now, failureReason: result.error || 'WhatsApp send failed.' };
    }
    return { ...run, status: 'failed', failedAt: now, failureReason: 'Worker did not return a send result.' };
  });

  const callbackResults = updatedRuns.filter((run) => run.runToken === runToken);
  const sentRuns = callbackResults.filter((run) => run.status === 'sent');
  const failedRuns = callbackResults.filter((run) => run.status === 'failed');
  const callbackStatus = failedRuns.length === 0
    ? 'success'
    : sentRuns.length === 0
      ? 'failed'
      : 'partial';

  const messageWrites = sentRuns.map((run) => {
    const id = `automation-${sha256(run.dedupeKey)}`;
    return makeUpdateWrite(projectId, 'messages', id, {
      id,
      customerId: run.customerId,
      text: run.messageText || '',
      channel: 'WhatsApp',
      date: new Date(run.sentAt || now).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
      createdAt: run.sentAt || now,
      opened: false,
    });
  });

  const mergedAutomations = automations.map((auto) => automationStatsFor(auto, updatedRuns));
  const schedule = normalizeAutomationSchedule((await getShopAutomationScheduler(shop)) || {});
  const currentRunDay = schedule.lastRunDate;
  const updatedSchedule = {
    ...schedule,
    lastRunAt: now,
    lastRunStatus: callbackStatus,
    lastRunSummary: {
      eligible: callbackResults.length,
      queued: callbackResults.filter((run) => run.status === 'queued').length,
      failed: failedRuns.length,
    },
    lastRunDate: currentRunDay,
  };

  const writes = [
    ...callbackResults.map((run) => makeUpdateWrite(projectId, 'automationRuns', run.__docId, run)),
    ...messageWrites,
    ...mergedAutomations.map((auto) => makeUpdateWrite(projectId, 'automations', auto.__docId || auto.id, auto)),
    makeUpdateWrite(projectId, 'automationScheduler', 'current', updatedSchedule),
  ];
  await commitWrites(serviceAccount, projectId, writes);

  return { shopId, updated: callbackResults.length, sent: sentRuns.length, failed: failedRuns.length, status: callbackStatus };
}

async function processAutomationSchedules() {
  const shops = await listCentral('shops');
  const results = [];
  for (const shop of shops) {
    if (!shop.shopId || shop.deletedAt || shop.status !== 'active') continue;
    try {
      results.push(await runScheduledAutomationsForShop(shop));
    } catch (error) {
      results.push({ shopId: shop.shopId, status: 'failed', error: error.message || 'Automation run failed.' });
    }
  }
  return results;
}

async function processExpiries() {
  const shops = await listCentral('shops');
  const results = [];
  for (const shop of shops) {
    if (!shop.shopId || shop.deletedAt) continue;
    const before = shop.status;
    await ensureBillingState(shop.shopId);
    const after = await getShopRecord(shop.shopId);
    if (before !== after?.status || (after?.renewalQrDataUrl && before === 'active')) results.push(after.shopId);
  }
  return results;
}

async function razorpayFetch(method, endpoint, body) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) fail(500, 'Razorpay credentials are not configured.');
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${endpoint}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) fail(response.status >= 500 ? 502 : response.status, data?.error?.description || `Razorpay request failed (${response.status}).`);
  return data;
}

async function createRazorpayOrderForCycle(cycleId, shop) {
  const cycle = await getBillingCycle(cycleId);
  if (!cycle || cycle.shopId !== shop.shopId) fail(404, 'Billing cycle not found.');
  if (cycle.status === 'paid') return cycle;
  if (cycle.razorpayOrderId) return cycle;
  const order = await razorpayFetch('POST', '/orders', {
    amount: Math.round(Number(cycle.amount || shop.price || 0) * 100),
    currency: cycle.currency || 'INR',
    receipt: cycleId,
    notes: { shopId: shop.shopId, cycleId },
  });
  const updated = { ...cycle, razorpayOrderId: order.id, razorpayKeyId: RAZORPAY_KEY_ID };
  await setBillingCycle(cycleId, updated);
  return updated;
}

async function activatePaidCycle(cycle, payment) {
  const shop = await getShopRecord(cycle.shopId);
  if (!shop || shop.deletedAt) return;
  if (shop.currentCycleId && shop.currentCycleId !== cycle.cycleId) return;
  if (cycle.status === 'paid') return;
  const paidAt = new Date().toISOString();
  const start = paidAt;
  const end = addDays(new Date(paidAt), 30).toISOString();
  const updatedCycle = { ...cycle, status: 'paid', paidAt, razorpayPaymentId: payment.paymentId, razorpayOrderId: payment.orderId };
  await setBillingCycle(cycle.cycleId, updatedCycle);
  await setCentralDoc('shops', shop.shopId, {
    ...shop,
    status: 'active',
    billingStart: start,
    billingEnd: end,
    currentCycleId: cycle.cycleId,
    renewalQrDataUrl: null,
    renewalUrl: null,
    updatedAt: paidAt,
  });
}

async function processWebhook(payload, signature) {
  if (!RAZORPAY_WEBHOOK_SECRET) fail(500, 'RAZORPAY_WEBHOOK_SECRET is not configured.');
  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
  if (!hashEqual(expected, signature || '')) fail(401, 'Invalid Razorpay webhook signature.');
  const body = JSON.parse(payload);
  const event = body.event;
  const entity = body.payload?.payment?.entity;
  if (event === 'payment.captured' && entity) {
    const orderId = entity.order_id;
    const paymentId = entity.id;
    const cycles = await listCentral('billingCycles');
    const cycle = cycles.find(c => c.razorpayOrderId === orderId);
    if (!cycle) return;
    const shop = await getShopRecord(cycle.shopId);
    if (!shop || shop.deletedAt || (shop.currentCycleId && shop.currentCycleId !== cycle.cycleId)) return;
    const expectedAmount = Math.round(Number(cycle.amount) * 100);
    if (Number(entity.amount) !== expectedAmount || entity.currency !== cycle.currency || entity.status !== 'captured') {
      fail(400, 'Webhook payment details do not match the expected billing cycle.');
    }
    await activatePaidCycle(cycle, { paymentId, orderId });
  }
}

// --- Core routes ---
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'rebook-api' }));

app.post('/api/admin/login', (req, res, next) => {
  try {
    checkAdminLoginRateLimit(req.ip);
    if (!SUPER_ADMIN_PASSWORD) return res.status(500).json({ error: 'SUPER_ADMIN_PASSWORD is not configured.' });
    const password = String(req.body?.password || '');
    if (!password || !hashEqual(password, SUPER_ADMIN_PASSWORD)) return res.status(401).json({ error: 'Invalid password.' });
    res.json({ success: true, token: signAdminToken({ role: 'superadmin' }) });
  } catch (e) { next(e); }
});

app.get('/api/admin/shops', requireAdmin, async (_req, res, next) => {
  try {
    const shops = await listCentral('shops');
    res.json({ shops: shops.map(publicShop) });
  } catch (e) { next(e); }
});

app.post('/api/admin/shops', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const required = ['shopName', 'ownerName', 'ownerEmail', 'price', 'firebaseServiceAccountJson'];
    for (const key of required) if (!body[key]) return res.status(400).json({ error: `${key} is required.` });
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(body.firebaseServiceAccountJson);
    } catch (_) {
      return res.status(400).json({ error: 'Firebase service account JSON is not valid JSON. Paste the original downloaded service-account JSON file contents exactly.' });
    }
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) return res.status(400).json({ error: 'Firebase service account JSON is missing project_id/client_email/private_key.' });
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(body.ownerEmail).trim())) return res.status(400).json({ error: 'ownerEmail must be a valid email address.' });
    if (!Number.isFinite(Number(body.price)) || Number(body.price) <= 0) return res.status(400).json({ error: 'price must be greater than 0.' });
    const configuredProjectId = String(body.firebaseProjectId || '').trim();
    if (configuredProjectId && configuredProjectId !== serviceAccount.project_id) return res.status(400).json({ error: 'Firebase Project ID does not match the service-account project_id.' });
    const publicConfig = body.firebaseWebConfig || null;
    if (publicConfig !== null && (typeof publicConfig !== 'object' || !publicConfig.projectId || !publicConfig.appId || !publicConfig.apiKey)) {
      return res.status(400).json({ error: 'Firebase Web App Config must contain projectId, appId and apiKey.' });
    }
    if (publicConfig?.projectId && publicConfig.projectId !== serviceAccount.project_id) return res.status(400).json({ error: 'Firebase Web App Config projectId does not match the service-account project_id.' });
    const existingShops = await listCentral('shops');
    if (existingShops.some((shop) => shop.firebaseProjectId === serviceAccount.project_id && shop.status !== 'deleted')) {
      return res.status(409).json({ error: 'A shop is already connected to this Firebase project.' });
    }
    serviceAccount.private_key = normalizeFirebasePrivateKey(serviceAccount.private_key);
    const shopId = `shop_${crypto.randomBytes(8).toString('hex')}`;
    const accessToken = crypto.randomBytes(24).toString('base64url');
    const cycleId = `cycle_${shopId}_initial`;
    const tempShop = {
      shopId,
      shopName: String(body.shopName).trim(),
      ownerName: String(body.ownerName).trim(),
      ownerEmail: String(body.ownerEmail).trim(),
      phone: String(body.phone || '').trim(),
      address: String(body.address || '').trim(),
      price: Number(body.price),
      currency: String(body.currency || 'INR'),
      status: 'pending',
      billingStart: null,
      billingEnd: null,
      currentCycleId: cycleId,
      renewalQrDataUrl: null,
      renewalUrl: null,
      firebaseProjectId: serviceAccount.project_id,
      firebaseWebConfig: publicConfig,
      firebaseServiceAccountEncrypted: encryptSecret(JSON.stringify(serviceAccount)),
      accessTokenHash: sha256(accessToken),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Verify we can authenticate to the supplied Firebase before accepting the shop.
    await googleAccessToken(serviceAccount);
    await listDocuments(serviceAccount, serviceAccount.project_id, 'rebook_connection_test').catch((error) => {
      // A missing collection is fine; the Firestore API returns a valid empty response when accessible.
      if (error.status !== 404) throw error;
    });
    const initialStaff = Array.isArray(body.initialStaff) ? body.initialStaff : [];
    const staffWrites = initialStaff
      .filter((staff) => staff && String(staff.name || '').trim())
      .map((staff, index) => ({
        __docId: `staff_${crypto.randomBytes(6).toString('hex')}`,
        id: Date.now() + index,
        name: String(staff.name).trim(),
        phone: String(staff.phone || '').trim(),
        template: String(staff.template || '').trim(),
        active: staff.active !== false,
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        startTime: '09:00',
        endTime: '18:00',
      }));
    if (staffWrites.length) {
      await commitWrites(serviceAccount, serviceAccount.project_id, staffWrites.map((item) => makeUpdateWrite(serviceAccount.project_id, 'staff', item.__docId, item)));
    }
    const qr = await createQrForCycle(req, shopId, cycleId);
    await setCentralDoc('shops', shopId, { ...tempShop, renewalQrDataUrl: qr.qrDataUrl, renewalUrl: qr.url });
    await setBillingCycle(cycleId, {
      cycleId,
      shopId,
      amount: Number(body.price),
      currency: String(body.currency || 'INR'),
      status: 'pending',
      createdAt: new Date().toISOString(),
      dueAt: new Date().toISOString(),
      qrUrl: qr.url,
      qrDataUrl: qr.qrDataUrl,
      razorpayOrderId: null,
      razorpayPaymentId: null,
    });
    res.json({ success: true, shop: publicShop({ ...tempShop, renewalQrDataUrl: qr.qrDataUrl, renewalUrl: qr.url }), accessToken, appUrl: `${baseUrlFromReq(req)}/shop/${shopId}/${accessToken}` });
  } catch (e) { next(e); }
});

// Correct delete route: soft-delete central access; never touch the shop Firebase data.
app.delete('/api/admin/shops/:shopId', requireAdmin, async (req, res, next) => {
  try {
    const shop = await getShopRecord(req.params.shopId);
    if (!shop) return res.status(404).json({ error: 'Shop not found.' });
    await setCentralDoc('shops', shop.shopId, { ...shop, status: 'deleted', deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.get('/api/public/shops/:shopId', async (req, res, next) => {
  try {
    const shop = await ensureBillingState(req.params.shopId, req);
    if (!shop) return res.status(404).json({ error: 'Shop not found.' });
    res.json({ shop: publicShop(await getShopRecord(req.params.shopId)) });
  } catch (e) { next(e); }
});

app.get('/api/public/billing/:shopId/:cycleId', async (req, res, next) => {
  try {
    const shop = await getShopRecord(req.params.shopId);
    const cycle = await getBillingCycle(req.params.cycleId);
    if (!shop || !cycle || cycle.shopId !== shop.shopId) return res.status(404).json({ error: 'Billing cycle not found.' });
    res.json({ shop: publicShop(shop), cycle: { cycleId: cycle.cycleId, amount: cycle.amount, currency: cycle.currency, status: cycle.status, qrDataUrl: cycle.qrDataUrl, qrUrl: cycle.qrUrl, razorpayOrderId: cycle.razorpayOrderId, razorpayKeyId: RAZORPAY_KEY_ID } });
  } catch (e) { next(e); }
});

app.post('/api/public/billing/:shopId/:cycleId/order', async (req, res, next) => {
  try {
    const shop = await ensureBillingState(req.params.shopId, req);
    if (!shop || shop.deletedAt) return res.status(404).json({ error: 'Shop not found.' });
    const cycle = await getBillingCycle(req.params.cycleId);
    if (!cycle || cycle.shopId !== shop.shopId) return res.status(404).json({ error: 'Billing cycle not found.' });
    if (cycle.status === 'paid') return res.status(409).json({ error: 'This billing cycle is already paid.' });
    if (shop.currentCycleId && shop.currentCycleId !== cycle.cycleId) return res.status(409).json({ error: 'This billing cycle is no longer the current payable cycle.' });
    const updated = await createRazorpayOrderForCycle(cycle.cycleId, shop);
    res.json({ success: true, keyId: RAZORPAY_KEY_ID, orderId: updated.razorpayOrderId, amount: Number(updated.amount), currency: updated.currency });
  } catch (e) { next(e); }
});

app.post('/api/public/billing/verify', async (req, res, next) => {
  try {
    const { shopId, cycleId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const cycle = await getBillingCycle(cycleId);
    if (!cycle || cycle.shopId !== shopId) return res.status(404).json({ error: 'Billing cycle not found.' });
    const shop = await getShopRecord(shopId);
    if (!shop || shop.deletedAt) return res.status(404).json({ error: 'Shop not found.' });
    if (shop.currentCycleId && shop.currentCycleId !== cycle.cycleId) return res.status(409).json({ error: 'This billing cycle is no longer the current payable cycle.' });
    const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (!hashEqual(expected, razorpay_signature || '')) return res.status(400).json({ error: 'Payment signature verification failed.' });
    if (cycle.razorpayOrderId !== razorpay_order_id) return res.status(400).json({ error: 'Payment order mismatch.' });
    const payment = await razorpayFetch('GET', `/payments/${encodeURIComponent(razorpay_payment_id)}`);
    if (payment.order_id !== razorpay_order_id || payment.currency !== cycle.currency || Number(payment.amount) !== Math.round(Number(cycle.amount) * 100) || payment.status !== 'captured') {
      return res.status(400).json({ error: 'Payment details do not match the expected captured billing payment.' });
    }
    await activatePaidCycle(cycle, { paymentId: razorpay_payment_id, orderId: razorpay_order_id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.post('/api/razorpay/webhook', async (req, res, next) => {
  try {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    await processWebhook(raw, req.headers['x-razorpay-signature']);
    res.json({ received: true });
  } catch (e) { next(e); }
});

// WhatsApp worker proxy. The browser never talks directly to Oracle.
app.get('/api/demo/whatsapp/status', requireDemoWhatsApp, async (_req, res, next) => {
  try { res.json(await demoWhatsAppProxy(`/api/status?shopId=${encodeURIComponent(DEMO_WHATSAPP_SHOP_ID)}`, { method: 'GET' })); }
  catch (e) { next(e); }
});

app.post('/api/demo/whatsapp/connect', requireDemoWhatsApp, async (_req, res, next) => {
  try { res.json(await demoWhatsAppProxy('/api/connect', { method: 'POST', body: JSON.stringify({ shopId: DEMO_WHATSAPP_SHOP_ID }) })); }
  catch (e) { next(e); }
});

app.post('/api/demo/whatsapp/send-single', requireDemoWhatsApp, async (req, res, next) => {
  try { res.json(await demoWhatsAppProxy('/api/send-single', { method: 'POST', body: JSON.stringify({ ...(req.body || {}), shopId: DEMO_WHATSAPP_SHOP_ID }) })); }
  catch (e) { next(e); }
});

app.post('/api/demo/whatsapp/blast', requireDemoWhatsApp, async (req, res, next) => {
  try { res.json(await demoWhatsAppProxy('/api/blast', { method: 'POST', body: JSON.stringify({ ...(req.body || {}), shopId: DEMO_WHATSAPP_SHOP_ID }) })); }
  catch (e) { next(e); }
});

app.get('/api/demo/whatsapp/blast/progress', requireDemoWhatsApp, async (_req, res, next) => {
  try { res.json(await demoWhatsAppProxy(`/api/blast/progress?shopId=${encodeURIComponent(DEMO_WHATSAPP_SHOP_ID)}`, { method: 'GET' })); }
  catch (e) { next(e); }
});

app.post('/api/demo/whatsapp/blast/cancel', requireDemoWhatsApp, async (_req, res, next) => {
  try { res.json(await demoWhatsAppProxy('/api/blast/cancel', { method: 'POST', body: JSON.stringify({ shopId: DEMO_WHATSAPP_SHOP_ID }) })); }
  catch (e) { next(e); }
});

app.post('/api/demo/whatsapp/reset', requireDemoWhatsApp, async (_req, res, next) => {
  try { res.json(await demoWhatsAppProxy('/api/reset', { method: 'POST', body: JSON.stringify({ shopId: DEMO_WHATSAPP_SHOP_ID }) })); }
  catch (e) { next(e); }
});

app.post('/api/demo/whatsapp/disconnect', requireDemoWhatsApp, async (_req, res, next) => {
  try { res.json(await demoWhatsAppProxy('/api/disconnect', { method: 'POST', body: JSON.stringify({ shopId: DEMO_WHATSAPP_SHOP_ID }) })); }
  catch (e) { next(e); }
});

app.get('/api/shop/:shopId/whatsapp/status', requireShopAccess, async (req, res, next) => {
  try {
    const data = await whatsappBridgeFetch(`/api/status?shopId=${encodeURIComponent(req.params.shopId)}`, { method: 'GET' });
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/shop/:shopId/whatsapp/connect', requireShopAccess, async (req, res, next) => {
  try {
    const data = await whatsappBridgeFetch('/api/connect', { method: 'POST', body: JSON.stringify({ shopId: req.params.shopId }) });
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/shop/:shopId/whatsapp/send-single', requireShopAccess, async (req, res, next) => {
  try {
    const data = await whatsappBridgeFetch('/api/send-single', { method: 'POST', body: JSON.stringify({ ...(req.body || {}), shopId: req.params.shopId }) });
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/shop/:shopId/whatsapp/blast', requireShopAccess, async (req, res, next) => {
  try {
    const data = await whatsappBridgeFetch('/api/blast', { method: 'POST', body: JSON.stringify({ ...(req.body || {}), shopId: req.params.shopId }) });
    res.json(data);
  } catch (e) { next(e); }
});

app.get('/api/shop/:shopId/whatsapp/blast/progress', requireShopAccess, async (req, res, next) => {
  try {
    const data = await whatsappBridgeFetch(`/api/blast/progress?shopId=${encodeURIComponent(req.params.shopId)}`, { method: 'GET' });
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/shop/:shopId/whatsapp/blast/cancel', requireShopAccess, async (req, res, next) => {
  try {
    const data = await whatsappBridgeFetch('/api/blast/cancel', { method: 'POST', body: JSON.stringify({ shopId: req.params.shopId }) });
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/shop/:shopId/whatsapp/reset', requireShopAccess, async (req, res, next) => {
  try {
    const data = await whatsappBridgeFetch('/api/reset', { method: 'POST', body: JSON.stringify({ shopId: req.params.shopId }) });
    res.json(data);
  } catch (e) { next(e); }
});

app.post('/api/shop/:shopId/whatsapp/disconnect', requireShopAccess, async (req, res, next) => {
  try {
    const data = await whatsappBridgeFetch('/api/disconnect', { method: 'POST', body: JSON.stringify({ shopId: req.params.shopId }) });
    res.json(data);
  } catch (e) { next(e); }
});

app.get('/api/shop/:shopId/state', requireShopAccess, async (req, res, next) => {
  try { res.json(await shopSnapshot(req.shop)); } catch (e) { next(e); }
});

app.post('/api/shop/:shopId/sync', requireShopAccess, async (req, res, next) => {
  try {
    const { collection, upserts = [], deletes = [] } = req.body || {};
    const allowed = [...SHOP_COLLECTIONS, 'salon', 'notifications'];
    if (!allowed.includes(collection)) return res.status(400).json({ error: 'Unsupported collection.' });
    const { serviceAccount, projectId } = await getShopFirebase(req.shop);
    const writes = [];
    for (const item of upserts) {
      const id = item?.__docId ?? item?.id ?? item?.key ?? 'current';
      writes.push(makeUpdateWrite(projectId, collection, id, item));
    }
    for (const id of deletes) writes.push(makeDeleteWrite(projectId, collection, id));
    if (writes.length) await commitWrites(serviceAccount, projectId, writes);
    res.json({ success: true, writes: writes.length });
  } catch (e) { next(e); }
});

app.post('/api/shop/:shopId/reset', requireShopAccess, async (req, res, next) => {
  try {
    if (process.env.ALLOW_CLOUD_RESET !== 'true') return res.status(403).json({ error: 'Cloud reset is disabled.' });
    const { serviceAccount, projectId } = await getShopFirebase(req.shop);
    for (const collection of [...SHOP_COLLECTIONS, 'salon', 'notifications']) {
      const docs = await listDocuments(serviceAccount, projectId, collection);
      if (!docs.length) continue;
      await commitWrites(serviceAccount, projectId, docs.map(d => makeDeleteWrite(projectId, collection, d.__docId)));
    }
    res.json({ success: true });
  } catch (e) { next(e); }
});

app.post('/api/internal/automation-blast-result', async (req, res, next) => {
  try {
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!AUTOMATION_CALLBACK_SECRET || !hashEqual(supplied, AUTOMATION_CALLBACK_SECRET)) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    const result = await processAutomationBlastResult(req.body || {});
    res.json({ success: true, ...result });
  } catch (e) { next(e); }
});

app.get('/api/cron/automations', async (req, res, next) => {
  try {
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!CRON_SECRET || !hashEqual(supplied, CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized.' });
    const results = await processAutomationSchedules();
    res.json({ success: true, results });
  } catch (e) { next(e); }
});

app.get('/api/cron/billing', async (req, res, next) => {
  try {
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '');
    if (!CRON_SECRET || !hashEqual(supplied, CRON_SECRET)) return res.status(401).json({ error: 'Unauthorized.' });
    const expired = await processExpiries();
    res.json({ success: true, expired });
  } catch (e) { next(e); }
});

app.use((error, _req, res, _next) => {
  console.error('ReBook API error:', error.message);
  res.status(error.status || 500).json({ error: error.message || 'Internal server error.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ReBook API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
