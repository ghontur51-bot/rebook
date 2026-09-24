export interface ShopPublicRecord {
  shopId: string;
  shopName: string;
  ownerName: string;
  ownerEmail: string;
  address: string;
  phone: string;
  price: number;
  currency: string;
  status: "pending" | "active" | "frozen" | "deleted" | string;
  billingStart: string | null;
  billingEnd: string | null;
  renewalCycleId: string | null;
  renewalQrDataUrl: string | null;
  renewalUrl: string | null;
}

export interface ShopRuntime {
  mode: "demo" | "cloud";
  shopId: string;
  accessToken: string;
  shop: ShopPublicRecord;
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status}).`) as Error & { status?: number; shop?: ShopPublicRecord };
    error.status = response.status;
    error.shop = data?.shop;
    throw error;
  }
  return data as T;
}

export async function getPublicShop(shopId: string): Promise<ShopPublicRecord> {
  const data = await request<{ shop: ShopPublicRecord }>(`/api/public/shops/${encodeURIComponent(shopId)}`);
  return data.shop;
}

export async function getCloudState(runtime: ShopRuntime) {
  return request<any>(`/api/shop/${encodeURIComponent(runtime.shopId)}/state`, {
    headers: { "x-shop-access-token": runtime.accessToken },
  });
}

export async function syncCloudCollection(
  runtime: ShopRuntime,
  collection: string,
  upserts: unknown[] = [],
  deletes: (string | number)[] = [],
) {
  return request<{ success: boolean; writes: number }>(`/api/shop/${encodeURIComponent(runtime.shopId)}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shop-access-token": runtime.accessToken,
    },
    body: JSON.stringify({ collection, upserts, deletes }),
  });
}

export async function resetCloudData(runtime: ShopRuntime) {
  return request<{ success: boolean }>(`/api/shop/${encodeURIComponent(runtime.shopId)}/reset`, {
    method: "POST",
    headers: { "x-shop-access-token": runtime.accessToken },
  });
}

export async function getBillingCycle(shopId: string, cycleId: string) {
  return request<any>(`/api/public/billing/${encodeURIComponent(shopId)}/${encodeURIComponent(cycleId)}`);
}

export async function createBillingOrder(shopId: string, cycleId: string) {
  return request<{ success: boolean; keyId: string; orderId: string; amount: number; currency: string }>(
    `/api/public/billing/${encodeURIComponent(shopId)}/${encodeURIComponent(cycleId)}/order`,
    { method: "POST" },
  );
}

export async function verifyBillingPayment(payload: {
  shopId: string;
  cycleId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  return request<{ success: boolean }>("/api/public/billing/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function adminLogin(password: string) {
  return request<{ success: boolean; token: string }>("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

function adminHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function adminListShops(token: string) {
  return request<{ shops: ShopPublicRecord[] }>("/api/admin/shops", { headers: { Authorization: `Bearer ${token}` } });
}

export async function adminCreateShop(token: string, payload: Record<string, unknown>) {
  return request<{ success: boolean; shop: ShopPublicRecord; accessToken: string; appUrl: string }>("/api/admin/shops", {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function adminDeleteShop(token: string, shopId: string) {
  return request<{ success: boolean }>(`/api/admin/shops/${encodeURIComponent(shopId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
