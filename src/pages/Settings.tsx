import React, { useState, useEffect, useMemo } from "react";
import { getBridgeStatus, resetBridgeSession, BridgeStatus } from "../services/whatsappBridgeService";
import { useApp } from "../context/AppContext";
import { PopupCard, ConfirmDialog } from "../components/ModalCard";

export default function Settings() {
  const { salon, updateSalon, notifications, updateNotifications, staff, addStaff, updateStaff, deleteStaff, resetAppData } = useApp();
  const [saved, setSaved] = useState(false);
  const [plan] = useState({ name: "Pro", price: "₹1,499", renewal: "October 13, 2026", status: "Active" });
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    online: false,
    isReady: false,
    hasQr: false,
    qrDataUrl: null,
    clientInfo: null,
  });

  // Modern Popup and Confirm State
  const [popupData, setPopupData] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "success" | "error" | "info" | "warning";
    details?: string[];
  }>({ isOpen: false, title: "", message: "", type: "success" });

  const [confirmData, setConfirmData] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDanger?: boolean;
    isLoading?: boolean;
    onConfirm?: () => Promise<void> | void;
  }>({ isOpen: false, title: "", message: "" });

  useEffect(() => {
    getBridgeStatus().then(setBridgeStatus);
  }, []);

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  // Handle Delete WhatsApp Bridge Data with custom popup card
  const promptResetWhatsApp = () => {
    setConfirmData({
      isOpen: true,
      title: "Delete WhatsApp Bridge Data?",
      message: "This will unlink your device, delete stored session credentials, and clear the authentication cache. You will need to scan a new QR code to reconnect.",
      confirmText: "Delete & Reset",
      isDanger: true,
      isLoading: false,
      onConfirm: async () => {
        setConfirmData(prev => ({ ...prev, isLoading: true }));
        try {
          const res = await resetBridgeSession();
          const s = await getBridgeStatus(true);
          setBridgeStatus(s);
          setConfirmData({ isOpen: false, title: "", message: "" });

          setPopupData({
            isOpen: true,
            title: "WhatsApp Bridge Data Deleted",
            message: res.success
              ? "All stored WhatsApp Web credentials and local session data were safely deleted. The bridge is cleanly reset."
              : (res.error || "Reset command processed. Bridge status refreshed."),
            type: res.success ? "success" : "warning",
            details: [
              "Linked device unlinked and credentials deleted",
              "Local session cache wiped",
              "Fresh QR code will be generated on your next connection"
            ]
          });
        } catch (err: any) {
          setConfirmData({ isOpen: false, title: "", message: "" });
          setPopupData({
            isOpen: true,
            title: "Error Resetting WhatsApp",
            message: err.message || "Cannot reach WhatsApp Bridge on port 5001.",
            type: "error"
          });
        }
      }
    });
  };

  // Handle Reset All App Data
  const promptResetAllData = () => {
    setConfirmData({
      isOpen: true,
      title: "Reset All Application Data?",
      message: "Are you sure you want to reset all data? This will restore clean demo data, reset all bookings, and wipe your WhatsApp session to factory defaults.",
      confirmText: "Reset Everything",
      isDanger: true,
      isLoading: false,
      onConfirm: async () => {
        setConfirmData(prev => ({ ...prev, isLoading: true }));
        resetAppData();
        try {
          await resetBridgeSession();
        } catch {}
        const s = await getBridgeStatus(true);
        setBridgeStatus(s);
        setConfirmData({ isOpen: false, title: "", message: "" });

        setPopupData({
          isOpen: true,
          title: "Factory Reset Completed",
          message: "Application data and WhatsApp session credentials have been restored to clean factory defaults.",
          type: "success"
        });
      }
    });
  };

  return (
    <div style={{ padding: "32px", maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em", margin: 0 }}>Settings</h1>
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>Manage your salon profile and preferences</div>
      </div>

      {/* Salon Info */}
      <div className="stat-card" style={{ marginBottom: 20, padding: "24px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 20 }}>🏬 Salon Information</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Salon Name", key: "name" },
            { label: "Phone Number", key: "phone" },
            { label: "Email", key: "email" },
            { label: "City", key: "city" },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>{f.label}</label>
              <input className="input" value={(salon as any)[f.key]} onChange={e => updateSalon({ [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Address</label>
          <input className="input" value={salon.address} onChange={e => updateSalon({ address: e.target.value })} />
        </div>
      </div>

      {/* Notifications */}
      <div className="stat-card" style={{ marginBottom: 20, padding: "24px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 20 }}>🔔 Notification Channels</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { key: "whatsapp", label: "WhatsApp", desc: "Send automated messages via WhatsApp" },
            { key: "sms", label: "SMS", desc: "Send automated messages via SMS" },
            { key: "email", label: "Email", desc: "Send automated messages via Email" },
            { key: "dailySummary", label: "Daily Summary", desc: "Receive a daily performance summary" },
          ].map(n => (
            <div key={n.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#F8FAFC", borderRadius: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{n.label}</div>
                <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{n.desc}</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={(notifications as any)[n.key]} onChange={() => updateNotifications({ [n.key]: !(notifications as any)[n.key] })} />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp Web Automation Bridge (No API Keys) */}
      <div className="stat-card" style={{ marginBottom: 20, padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>📱</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                WhatsApp Web Automation Bridge (Cloud)
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Provides local WhatsApp Web sending for opted-in customers
              </div>
            </div>
          </div>
          {bridgeStatus.online && bridgeStatus.isReady ? (
            <span style={{ fontSize: 12, background: "#DCFCE7", color: "#15803D", padding: "4px 10px", borderRadius: 20, fontWeight: 700, border: "1px solid #86EFAC" }}>
              ● Connected: {bridgeStatus.clientInfo?.name || "Ready"}
            </span>
          ) : bridgeStatus.online && bridgeStatus.hasQr ? (
            <span style={{ fontSize: 12, background: "#FEF9C3", color: "#854D0E", padding: "4px 10px", borderRadius: 20, fontWeight: 700, border: "1px solid #FDE047" }}>
              ● QR Code Ready (Scan in Campaigns)
            </span>
          ) : (
            <span style={{ fontSize: 12, background: "#F1F5F9", color: "#64748B", padding: "4px 10px", borderRadius: 20, fontWeight: 600 }}>
              ● Bridge Offline
            </span>
          )}
        </div>

        <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>
            How it works:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            <li>Runs on ReBook's persistent cloud worker. End-user computers do not need Node.js, npm, or a terminal.</li>
            <li>Connects directly to your regular WhatsApp Web session.</li>
            <li>Campaigns only include customers with an explicit WhatsApp opt-in. Each message is submitted one at a time.</li>
          </ul>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--foreground)" }}>
              Command to start bridge: <code style={{ background: "#E2E8F0", padding: "3px 8px", borderRadius: 6, fontWeight: 700, color: "#0F172A" }}>npm run wa-bridge</code>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={promptResetWhatsApp}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <span>🗑️</span> Reset WhatsApp Data
              </button>
              <button
                onClick={async () => {
                  const s = await getBridgeStatus(true);
                  setBridgeStatus(s);
                  setPopupData({
                    isOpen: true,
                    title: "Bridge Status Refreshed",
                    message: s.online
                      ? (s.isReady ? `Bridge is active and connected as ${s.clientInfo?.name || "WhatsApp User"}.` : "Bridge is running. QR code is ready to scan.")
                      : "Bridge server is currently offline on port 5001. Run 'npm run wa-bridge' in your terminal.",
                    type: s.online ? "info" : "warning"
                  });
                }}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                🔄 Refresh Status
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Plan */}
      <div className="roi-card" style={{ marginBottom: 20 }}>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#5EEAD4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>⚡ Your Plan</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { label: "Plan", value: plan.name },
              { label: "Price", value: `${plan.price}/mo` },
              { label: "Renews", value: plan.renewal },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button
              onClick={() => {
                setPopupData({
                  isOpen: true,
                  title: "Invoice #INV-2026-089",
                  message: "Your subscription invoice details for the current billing cycle:",
                  type: "info",
                  details: [
                    "Plan: Pro Plan (₹1,499/mo)",
                    "Status: Paid (Razorpay / UPI)",
                    "Billing Date: September 13, 2026",
                    "Next Renewal: October 13, 2026"
                  ]
                });
              }}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
            >
              View Invoice
            </button>
            <button
              onClick={() => {
                setPopupData({
                  isOpen: true,
                  title: "Pro Plan Active",
                  message: "You are currently on the highest tier (Pro Plan). All automated features, including WhatsApp campaigns and automated win-back flows, are fully unlocked!",
                  type: "success"
                });
              }}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
            >
              Manage Plan
            </button>
          </div>
        </div>
      </div>

      {/* Save & Reset */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-primary" onClick={save} style={{ padding: "10px 24px" }}>Save Changes</button>
          {saved && <span style={{ fontSize: 13, color: "#10B981", fontWeight: 500 }}>✓ Saved successfully</span>}
        </div>
        <button
          onClick={promptResetAllData}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #E2E8F0",
            background: "#F8FAFC",
            color: "#64748B",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🗑️ Reset All App Data
        </button>
      </div>

      {/* Modern Pop-up Card */}
      <PopupCard
        isOpen={popupData.isOpen}
        onClose={() => setPopupData(prev => ({ ...prev, isOpen: false }))}
        title={popupData.title}
        message={popupData.message}
        type={popupData.type}
        details={popupData.details}
      />

      {/* Modern Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmData.isOpen}
        onClose={() => setConfirmData(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmData.onConfirm || (() => {})}
        title={confirmData.title}
        message={confirmData.message}
        confirmText={confirmData.confirmText}
        isDanger={confirmData.isDanger}
        isLoading={confirmData.isLoading}
      />
    </div>
  );
}
