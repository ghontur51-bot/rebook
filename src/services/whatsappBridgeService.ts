// ReBook WhatsApp service.
// Production requests are proxied through the ReBook API to the persistent Oracle WhatsApp worker.
// The worker secret is never exposed to the browser.

export interface BridgeStatus {
  online: boolean;
  isReady: boolean;
  hasQr: boolean;
  qrDataUrl: string | null;
  clientInfo: { name: string; phone: string } | null;
  connectionState?: string;
  initializationError?: string | null;
  suppressionCount?: number;
  activeBlast?: { isRunning: boolean; total: number; sentCount: number; currentIndex: number };
}

export interface BlastRecipient { id: number | string; name: string; phone: string; avatar?: string; }
export interface BlastResultItem { id: number | string; name: string; phone: string; status: 'pending' | 'sending' | 'sent' | 'failed'; error?: string | null; }
export interface BlastProgressResponse { isRunning: boolean; campaignName: string; total: number; sentCount: number; failedCount: number; currentIndex: number; results: BlastResultItem[]; cancelled: boolean; }

function getContext(): { mode: 'shop' | 'demo'; shopId?: string; accessToken?: string } | null {
  const parts = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] === 'demo') return { mode: 'demo' };
  if (parts[0] !== 'shop' || !parts[1] || !parts[2]) return null;
  return { mode: 'shop', shopId: decodeURIComponent(parts[1]), accessToken: decodeURIComponent(parts[2]) };
}

export function getDemoWhatsAppPin(): string {
  return sessionStorage.getItem('rebook_demo_whatsapp_pin') || '';
}

export function setDemoWhatsAppPin(pin: string) {
  sessionStorage.setItem('rebook_demo_whatsapp_pin', pin);
}

export function clearDemoWhatsAppPin() {
  sessionStorage.removeItem('rebook_demo_whatsapp_pin');
}

export async function verifyDemoWhatsAppPin(pin: string): Promise<{ success: boolean; error?: string }> {
  const candidate = String(pin || '').trim();
  if (!candidate) return { success: false, error: 'Enter the demo WhatsApp PIN first.' };
  try {
    await bridgeRequest('/verify', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    }, candidate);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unable to verify the demo WhatsApp PIN.' };
  }
}

async function bridgeRequest<T>(suffix: string, init: RequestInit = {}, demoPinOverride?: string): Promise<T> {
  const context = getContext();
  if (!context) throw new Error('WhatsApp is available from a connected ReBook shop or the protected demo.');

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  let url: string;
  if (context.mode === 'demo') {
    const pin = String(demoPinOverride ?? getDemoWhatsAppPin()).trim();
    if (!pin) throw new Error('Enter the demo WhatsApp PIN first.');
    headers.set('X-Demo-WhatsApp-Pin', pin);
    url = '/api/demo/whatsapp' + suffix;
  } else {
    headers.set('X-Shop-Access-Token', context.accessToken!);
    url = '/api/shop/' + encodeURIComponent(context.shopId!) + '/whatsapp' + suffix;
  }

  const response = await fetch(url, { ...init, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || ('WhatsApp worker request failed (' + response.status + ').'));
  return data as T;
}

let inFlightStatusPromise: Promise<BridgeStatus> | null = null;
let lastStatusTimestamp = 0;
let lastKnownStatus: BridgeStatus = { online: false, isReady: false, hasQr: false, qrDataUrl: null, clientInfo: null };

export function isEqualBridgeStatus(a: BridgeStatus, b: BridgeStatus): boolean {
  if (a === b) return true;
  if (a.online !== b.online || a.isReady !== b.isReady || a.hasQr !== b.hasQr) return false;
  if (a.qrDataUrl !== b.qrDataUrl || a.initializationError !== b.initializationError) return false;
  if (a.connectionState !== b.connectionState || a.suppressionCount !== b.suppressionCount) return false;
  if (Boolean(a.clientInfo) !== Boolean(b.clientInfo)) return false;
  if (a.clientInfo && b.clientInfo && (a.clientInfo.name !== b.clientInfo.name || a.clientInfo.phone !== b.clientInfo.phone)) return false;
  return true;
}

export async function getBridgeStatus(forceFresh = false): Promise<BridgeStatus> {
  const now = Date.now();
  if (!forceFresh && inFlightStatusPromise) return inFlightStatusPromise;
  if (!forceFresh && now - lastStatusTimestamp < 800) return lastKnownStatus;
  inFlightStatusPromise = (async () => {
    try {
      const data = await bridgeRequest<BridgeStatus>('/status', { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      const next: BridgeStatus = { online: true, isReady: Boolean(data.isReady), hasQr: Boolean(data.hasQr), qrDataUrl: data.qrDataUrl || null, clientInfo: data.clientInfo || null, connectionState: data.connectionState, initializationError: data.initializationError || null, suppressionCount: data.suppressionCount, activeBlast: data.activeBlast };
      lastKnownStatus = next; lastStatusTimestamp = Date.now(); return next;
    } catch (error: any) {
      const offline: BridgeStatus = { online: false, isReady: false, hasQr: false, qrDataUrl: null, clientInfo: null, initializationError: error?.message || 'WhatsApp worker is unavailable.' };
      lastKnownStatus = offline; lastStatusTimestamp = Date.now(); return offline;
    }
  })().finally(() => { inFlightStatusPromise = null; });
  return inFlightStatusPromise;
}

export async function connectBridgeSession(): Promise<{ success: boolean; error?: string }> {
  try { await bridgeRequest('/connect', { method: 'POST', body: '{}' }); return { success: true }; }
  catch (error: any) { return { success: false, error: error?.message || 'Unable to start WhatsApp session.' }; }
}

export async function startBridgeBlast(recipients: BlastRecipient[], message: string, campaignName = 'Blast Campaign', delayMs = 5000, consentConfirmed = false): Promise<{ success: boolean; error?: string }> {
  try { await bridgeRequest('/blast', { method: 'POST', body: JSON.stringify({ recipients, message, campaignName, delayMs, consentConfirmed }) }); return { success: true }; }
  catch (error: any) { return { success: false, error: error?.message || 'Unable to start WhatsApp campaign.' }; }
}

export async function getBlastProgress(): Promise<BlastProgressResponse | null> {
  try { return await bridgeRequest<BlastProgressResponse>('/blast/progress', { method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }); } catch { return null; }
}

export async function cancelBridgeBlast(): Promise<boolean> {
  try { await bridgeRequest('/blast/cancel', { method: 'POST', body: '{}' }); return true; } catch { return false; }
}

export async function sendSingleViaBridge(phone: string, message: string, name: string, consentConfirmed = false): Promise<{ success: boolean; error?: string }> {
  try { await bridgeRequest('/send-single', { method: 'POST', body: JSON.stringify({ phone, message, name, consentConfirmed }) }); return { success: true }; }
  catch (error: any) { return { success: false, error: error?.message || 'Unable to send WhatsApp message.' }; }
}

export async function resetBridgeSession(): Promise<{ success: boolean; error?: string }> {
  try { await bridgeRequest('/reset', { method: 'POST', body: '{}' }); lastKnownStatus = { online: true, isReady: false, hasQr: false, qrDataUrl: null, clientInfo: null }; lastStatusTimestamp = Date.now(); return { success: true }; }
  catch (error: any) { return { success: false, error: error?.message || 'Unable to reset WhatsApp session.' }; }
}

export async function disconnectBridgeSession(): Promise<{ success: boolean; error?: string }> {
  try { await bridgeRequest('/disconnect', { method: 'POST', body: '{}' }); return { success: true }; }
  catch (error: any) { return { success: false, error: error?.message || 'Unable to disconnect WhatsApp.' }; }
}
