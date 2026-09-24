import React from "react";
import { ShopPublicRecord } from "../services/shopApi";

export default function ShopFrozen({ shop, onRefresh }: { shop: ShopPublicRecord; onRefresh: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background)", padding: 24 }}>
      <div className="stat-card" style={{ width: "100%", maxWidth: 560, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>ReBook Access Frozen</h1>
        <div style={{ marginTop: 8, color: "var(--muted-foreground)", fontSize: 14 }}>
          {shop.shopName} is currently locked because the 30-day billing period has ended. Your business data is preserved.
        </div>
        {shop.renewalQrDataUrl && (
          <div style={{ marginTop: 24 }}>
            <img src={shop.renewalQrDataUrl} alt="Renewal payment QR code" style={{ width: 250, height: 250, borderRadius: 12, border: "1px solid var(--border)" }} />
          </div>
        )}
        <div style={{ marginTop: 18, fontSize: 16, fontWeight: 800 }}>₹{Number(shop.price || 0).toLocaleString("en-IN")} / 30 days</div>
        {shop.renewalUrl && (
          <a className="btn-primary" href={shop.renewalUrl} style={{ display: "inline-flex", textDecoration: "none", marginTop: 14, padding: "10px 18px" }}>
            Open Renewal Payment
          </a>
        )}
        <button className="btn-secondary" style={{ marginTop: 12, marginLeft: 8 }} onClick={onRefresh}>Check Payment Status</button>
        <div style={{ marginTop: 18, fontSize: 12, color: "var(--muted-foreground)" }}>
          Customers, bookings, staff, automations, campaigns and analytics are not deleted.
        </div>
      </div>
    </div>
  );
}
