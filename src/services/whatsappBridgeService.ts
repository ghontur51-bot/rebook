// Frontend WhatsApp Bridge Service for ReBook SaaS
// Communicates with local Node.js bridge server on http://localhost:5001

export interface BridgeStatus {
  online: boolean;
  isReady: boolean;
  hasQr: boolean;
  qrDataUrl: string | null;
  clientInfo: {
    name: string;
    phone: string;
  } | null;
  initializationError?: string | null;
  activeBlast?: {
    isRunning: boolean;
    total: number;
    sentCount: number;
    currentIndex: number;
  };
}

export interface BlastRecipient {
  id: number | string;
  name: string;
  phone: string;
  avatar?: string;
}

export interface BlastResultItem {
  id: number | string;
  name: string;
  phone: string;
  status: "pending" | "sending" | "sent" | "failed";
  error?: string | null;
}

export interface BlastProgressResponse {
  isRunning: boolean;
  campaignName: string;
  total: number;
  sentCount: number;
  failedCount: number;
  currentIndex: number;
  results: BlastResultItem[];
  cancelled: boolean;
}

const BRIDGE_URL = "http://localhost:5001";

// In-flight request deduplication & memory cache to eliminate lag
let inFlightStatusPromise: Promise<BridgeStatus> | null = null;
let lastStatusTimestamp = 0;
let lastKnownStatus: BridgeStatus = {
  online: false,
  isReady: false,
  hasQr: false,
  qrDataUrl: null,
  clientInfo: null,
};

/**
 * Deep equality check to prevent React from re-rendering components when status is unchanged
 */
export function isEqualBridgeStatus(a: BridgeStatus, b: BridgeStatus): boolean {
  if (a === b) return true;
  if (a.online !== b.online || a.isReady !== b.isReady || a.hasQr !== b.hasQr) return false;
  if (a.qrDataUrl !== b.qrDataUrl) return false;
  if (a.initializationError !== b.initializationError) return false;
  if (Boolean(a.clientInfo) !== Boolean(b.clientInfo)) return false;
  if (a.clientInfo && b.clientInfo) {
    if (a.clientInfo.name !== b.clientInfo.name || a.clientInfo.phone !== b.clientInfo.phone) return false;
  }
  if (Boolean(a.activeBlast) !== Boolean(b.activeBlast)) return false;
  if (a.activeBlast && b.activeBlast) {
    if (
      a.activeBlast.isRunning !== b.activeBlast.isRunning ||
      a.activeBlast.sentCount !== b.activeBlast.sentCount ||
      a.activeBlast.currentIndex !== b.activeBlast.currentIndex ||
      a.activeBlast.total !== b.activeBlast.total
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Check if local WhatsApp Web bridge server is online and ready
 * Deduplicates in-flight fetches and caches results for up to 800ms
 */
export async function getBridgeStatus(forceFresh: boolean = false): Promise<BridgeStatus> {
  const now = Date.now();
  if (!forceFresh && inFlightStatusPromise) {
    return inFlightStatusPromise;
  }
  if (!forceFresh && now - lastStatusTimestamp < 800) {
    return lastKnownStatus;
  }

  inFlightStatusPromise = (async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/status`, {
        method: "GET",
        signal: AbortSignal.timeout(1800),
      });
      if (res.ok) {
        const data = await res.json();
        const newStatus: BridgeStatus = {
          online: true,
          isReady: Boolean(data.isReady),
          hasQr: Boolean(data.hasQr),
          qrDataUrl: data.qrDataUrl || null,
          clientInfo: data.clientInfo || null,
          initializationError: data.initializationError || null,
          activeBlast: data.activeBlast,
        };
        lastKnownStatus = newStatus;
        lastStatusTimestamp = Date.now();
        return newStatus;
      }
    } catch {
      // Bridge server not running or timed out
    }
    const offlineStatus: BridgeStatus = {
      online: false,
      isReady: false,
      hasQr: false,
      qrDataUrl: null,
      clientInfo: null,
    };
    lastKnownStatus = offlineStatus;
    lastStatusTimestamp = Date.now();
    return offlineStatus;
  })().finally(() => {
    inFlightStatusPromise = null;
  });

  return inFlightStatusPromise;
}

/**
 * Start automated blast via the local bridge
 */
export async function startBridgeBlast(
  recipients: BlastRecipient[],
  message: string,
  campaignName: string = "Blast Campaign",
  delayMs: number = 3000
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/blast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipients,
        message,
        campaignName,
        delayMs,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || "Failed to start blast." };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Cannot reach WhatsApp Bridge on port 5001." };
  }
}

/**
 * Poll current blast progress from bridge
 */
export async function getBlastProgress(): Promise<BlastProgressResponse | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/blast/progress`, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Cancel active blast
 */
export async function cancelBridgeBlast(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/blast/cancel`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send single message to one contact via bridge
 */
export async function sendSingleViaBridge(
  phone: string,
  message: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/send-single`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, name }),
    });
    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (e: any) {
    return { success: false, error: e.message || "Bridge unreachable" };
  }
}

/**
 * Reset / Disconnect WhatsApp Web session (deletes linked credentials and generates fresh QR)
 */
export async function resetBridgeSession(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BRIDGE_URL}/api/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    // Force clear internal cache so subsequent calls reflect the fresh state immediately
    lastKnownStatus = {
      online: true,
      isReady: false,
      hasQr: false,
      qrDataUrl: null,
      clientInfo: null,
    };
    lastStatusTimestamp = Date.now();
    return { success: res.ok && Boolean(data.success), error: data.error };
  } catch (e: any) {
    return { success: false, error: e.message || "Cannot reach WhatsApp Bridge on port 5001." };
  }
}
