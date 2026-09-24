import React, { useEffect, useState } from "react";
import { adminCreateShop, adminDeleteShop, adminListShops, adminLogin, type ShopPublicRecord } from "../services/shopApi";

function parseFirebaseWebConfigInput(raw: string) {
  const source = raw.trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch {
    // Also accept the common Firebase console JavaScript object form:
    // { apiKey: "...", authDomain: "...", ... }
    const firstBrace = source.indexOf("{");
    const lastBrace = source.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("Firebase Web App Config is not valid JSON. Use quoted property names like {\"apiKey\": \"...\"}.");
    }

    let normalized = source.slice(firstBrace, lastBrace + 1);
    normalized = normalized.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
    normalized = normalized.replace(/,\s*([}])/g, '$1');

    try {
      return JSON.parse(normalized);
    } catch {
      throw new Error("Firebase Web App Config could not be parsed. Paste the full Firebase config object.");
    }
  }
}

const SESSION_KEY = "rebook_superadmin_token_v1";

export default function SuperAdmin() {
  const [token, setToken] = useState(() => sessionStorage.getItem(SESSION_KEY) || "");
  const [password, setPassword] = useState("");
  const [shops, setShops] = useState<ShopPublicRecord[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ appUrl: string; accessToken: string; qrDataUrl: string; shop: ShopPublicRecord } | null>(null);
  const [form, setForm] = useState({
    shopName: "",
    ownerName: "",
    ownerEmail: "",
    phone: "",
    address: "",
    price: "",
    firebaseProjectId: "",
    firebaseWebConfig: "",
    firebaseServiceAccountJson: "",
    initialStaff: "",
  });

  const loadShops = async (currentToken = token) => {
    if (!currentToken) return;
    try { setShops((await adminListShops(currentToken)).shops); }
    catch (e: any) { setError(e.message || "Unable to load shops."); }
  };

  useEffect(() => { void loadShops(); }, [token]);

  const login = async () => {
    setError(""); setMessage("");
    try {
      const result = await adminLogin(password);
      sessionStorage.setItem(SESSION_KEY, result.token);
      setToken(result.token);
      setPassword("");
    } catch (e: any) { setError(e.message || "Login failed."); }
  };

  const createShop = async () => {
    setError(""); setMessage(""); setCreated(null);
    try {
      const initialStaff = form.initialStaff
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, phone = ""] = line.split("|").map((part) => part.trim());
          return { name, phone, template: "", active: true };
        })
        .filter((item) => item.name);
      const payload = {
        ...form,
        price: Number(form.price),
        firebaseWebConfig: parseFirebaseWebConfigInput(form.firebaseWebConfig),
        initialStaff,
      };
      const result = await adminCreateShop(token, payload);
      setCreated({ appUrl: result.appUrl, accessToken: result.accessToken, qrDataUrl: result.shop.renewalQrDataUrl || "", shop: result.shop });
      setMessage("Shop created. The first renewal/payment QR is ready.");
      setForm({ shopName: "", ownerName: "", ownerEmail: "", phone: "", address: "", price: "", firebaseProjectId: "", firebaseWebConfig: "", firebaseServiceAccountJson: "", initialStaff: "" });
      await loadShops();
    } catch (e: any) { setError(e.message || "Shop creation failed."); }
  };

  const deleteShop = async (shopId: string) => {
    if (!window.confirm("Disable this ReBook shop? Its Firebase data will NOT be deleted.")) return;
    setError("");
    try { await adminDeleteShop(token, shopId); await loadShops(); }
    catch (e: any) { setError(e.message || "Unable to disable shop."); }
  };

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--background)", padding: 24 }}>
        <div className="stat-card" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>ReBook Central</div>
          <h1 style={{ fontSize: 24, margin: "8px 0 18px", fontWeight: 800 }}>Super Admin</h1>
          <input className="input" type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void login(); }} />
          {error && <div style={{ marginTop: 10, color: "#B91C1C", fontSize: 13 }}>{error}</div>}
          <button className="btn-primary" style={{ marginTop: 14, width: "100%" }} onClick={() => void login()}>Unlock Central Admin</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: 32 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>ReBook Central</h1>
            <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 3 }}>Super Admin — create and control shops</div>
          </div>
          <button className="btn-secondary" onClick={() => { sessionStorage.removeItem(SESSION_KEY); setToken(""); }}>Lock</button>
        </div>

        {error && <div style={{ marginBottom: 14, color: "#B91C1C", fontSize: 13 }}>{error}</div>}
        {message && <div style={{ marginBottom: 14, color: "#166534", fontSize: 13 }}>{message}</div>}

        <div className="stat-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 18 }}>Create Shop</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[ ["Shop name", "shopName"], ["Owner name", "ownerName"], ["Owner Gmail", "ownerEmail"], ["Phone", "phone"], ["Address", "address"], ["Price / 30 days (₹)", "price" ] ].map(([label, key]) => (
              <div key={key}>
                <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>{label}</label>
                <input className="input" value={(form as any)[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Firebase Project ID (optional if present in service-account JSON)</label>
            <input className="input" value={form.firebaseProjectId} onChange={(e) => setForm((p) => ({ ...p, firebaseProjectId: e.target.value }))} />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Firebase Web App Config (JSON)</label>
            <textarea className="input" rows={5} placeholder='{ "apiKey": "...", "authDomain": "...", "projectId": "...", "appId": "..." }' value={form.firebaseWebConfig} onChange={(e) => setForm((p) => ({ ...p, firebaseWebConfig: e.target.value }))} />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Firebase Service Account JSON (server-side encrypted)</label>
            <textarea className="input" rows={8} placeholder='{ "type": "service_account", "project_id": "...", "client_email": "...", "private_key": "-----BEGIN PRIVATE KEY-----\\n..." }' value={form.firebaseServiceAccountJson} onChange={(e) => setForm((p) => ({ ...p, firebaseServiceAccountJson: e.target.value }))} />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6 }}>Initial Staff (optional)</label>
            <textarea className="input" rows={4} placeholder={'One staff per line: Name | WhatsApp phone'} value={form.initialStaff} onChange={(e) => setForm((p) => ({ ...p, initialStaff: e.target.value }))} />
          </div>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => void createShop()}>Create Shop + Generate First QR</button>
        </div>

        {created && (
          <div className="stat-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Shop Created</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>Shop URL:</div>
            <div style={{ marginTop: 4, padding: 10, borderRadius: 8, background: "#F8FAFC", fontSize: 12, wordBreak: "break-all" }}>{created.appUrl}</div>
            <div style={{ fontSize: 13, marginTop: 10 }}>Access token:</div>
            <div style={{ marginTop: 4, padding: 10, borderRadius: 8, background: "#F8FAFC", fontSize: 12, wordBreak: "break-all" }}>{created.accessToken}</div>
            {created.qrDataUrl && <img src={created.qrDataUrl} alt="First payment QR" style={{ width: 240, height: 240, marginTop: 14 }} />}
          </div>
        )}

        <div className="stat-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>Shops</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr 1fr auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>Demo Shop</div><div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Existing demo data • local/demo mode</div></div>
            <div style={{ fontSize: 13 }}>Demo</div>
            <div><span className="badge badge-gray">demo</span></div>
            <button className="btn-secondary" onClick={() => { window.location.href = "/"; }}>Open</button>
          </div>
          {shops.length === 0 ? <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>No shops yet.</div> : shops.map((shop) => (
            <div key={shop.shopId} style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr 1fr auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div><div style={{ fontWeight: 700, fontSize: 14 }}>{shop.shopName}</div><div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{shop.ownerEmail}</div></div>
              <div style={{ fontSize: 13 }}>₹{Number(shop.price).toLocaleString("en-IN")} / 30d</div>
              <div><span className="badge badge-gray" style={{ textTransform: "capitalize" }}>{shop.status}</span></div>
              <button className="btn-secondary" onClick={() => void deleteShop(shop.shopId)}>Disable</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
