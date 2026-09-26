import React, { useState, useEffect, useRef } from "react";
import { useApp, Customer, Campaign, isRepeatCustomer } from "../context/AppContext";
import {
  getBridgeStatus,
  connectBridgeSession,
  getDemoWhatsAppPin,
  setDemoWhatsAppPin,
  verifyDemoWhatsAppPin,
  clearDemoWhatsAppPin,
  startBridgeBlast,
  getBlastProgress,
  cancelBridgeBlast,
  sendSingleViaBridge,
  resetBridgeSession,
  isEqualBridgeStatus,
  BridgeStatus,
} from "../services/whatsappBridgeService";
import { PopupCard, ConfirmDialog } from "../components/ModalCard";

const audienceOptions = [
  "All Customers", "Active Customers", "Inactive (30-60 days)", "Inactive (60-90 days)",
  "VIP Customers", "High Value (₹10,000+)", "New Customers", "Repeat Customers", "Won Back Customers"
];

// --- Resolve audience to actual customer list ---
function resolveAudience(audience: string, customers: Customer[], bookings: ReturnType<typeof useApp>["bookings"]) {
  if (audience === "All Customers") return customers;
  if (audience === "Active Customers") return customers.filter(c => c.status === "active");
  if (audience.includes("Inactive")) return customers.filter(c => c.status === "inactive");
  if (audience === "VIP Customers") return customers.filter(c => c.tags.includes("VIP"));
  if (audience === "High Value (₹10,000+)") return customers.filter(c => c.totalSpend >= 10000);
  if (audience === "New Customers") return customers.filter(c => !isRepeatCustomer(c, bookings));
  if (audience === "Repeat Customers") return customers.filter(c => isRepeatCustomer(c, bookings));
  if (audience === "Won Back Customers") return customers.filter(c => c.status === "won_back");
  return customers.slice(0, Math.floor(customers.length * 0.4));
}

function resolveWhatsAppAudience(audience: string, customers: Customer[], bookings: ReturnType<typeof useApp>["bookings"]) {
  return resolveAudience(audience, customers, bookings).filter((customer) => customer.whatsappOptIn === true && String(customer.phone || "").trim());
}

type SendStatus = "pending" | "sending" | "sent" | "failed" | "opened";

interface WACustomer {
  id: number;
  name: string;
  phone: string;
  avatar: string;
  status: SendStatus;
  error?: string;
}

// --- WhatsApp Blast Modal ---
function WhatsAppBlastModal({
  campaign,
  message: initialMessage,
  onClose,
  customers,
  bookings,
  onComplete,
}: {
  campaign: any;
  message: string;
  onClose: () => void;
  customers: Customer[];
  bookings: ReturnType<typeof useApp>["bookings"];
  onComplete: (sentCount: number, recipientIds: number[], message: string) => void;
}) {
  const targetCustomers = resolveWhatsAppAudience(campaign.audience, customers, bookings);
  const [currentMessage, setCurrentMessage] = useState(
    initialMessage || `Hi {name}! ✨ Special offer at Glam Studio: We have an exclusive discount for you. Book now to claim it!`
  );
  const [isEditing, setIsEditing] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [sendList, setSendList] = useState<WACustomer[]>(
    targetCustomers.map(c => ({ id: c.id, name: c.name, phone: c.phone, avatar: c.avatar, status: "pending" }))
  );
  const [sentCount, setSentCount] = useState(0);
  const [isBlasting, setIsBlasting] = useState(false);
  const [blastDone, setBlastDone] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [currentSendingName, setCurrentSendingName] = useState<string>("");
  const [demoPin, setDemoPin] = useState("");
  const [demoPinSaved, setDemoPinSaved] = useState(false);
  const completionRecorded = useRef(false);
  const blastIntervalRef = useRef<any>(null);

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

  // Bridge connection status
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    online: false,
    isReady: false,
    hasQr: false,
    qrDataUrl: null,
    clientInfo: null,
  });

  const totalCount = sendList.length;

  // Poll bridge status smoothly without forcing re-renders if unchanged
  // AND NEVER auto-popup QR code without user intent!
  useEffect(() => {
    if (window.location.pathname.replace(/\/+$/, "") === "/demo" && !demoPinSaved) {
      setBridgeStatus({
        online: false,
        isReady: false,
        hasQr: false,
        qrDataUrl: null,
        clientInfo: null,
        connectionState: "PIN_REQUIRED",
        initializationError: "Verify the demo PIN to connect the Vercel Sandbox worker.",
      });
      return;
    }

    let mounted = true;
    const checkStatus = async () => {
      const status = await getBridgeStatus();
      if (mounted) {
        setBridgeStatus(prev => {
          if (isEqualBridgeStatus(prev, status)) {
            return prev; // Maintain reference to avoid re-render
          }
          if (status.isReady && showQrModal) {
            setShowQrModal(false);
          }
          return status;
        });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3500);
    return () => {
      mounted = false;
      clearInterval(interval);
      if (blastIntervalRef.current) {
        clearInterval(blastIntervalRef.current);
      }
    };
  }, [showQrModal, demoPinSaved]);

  // A PIN saved in sessionStorage is only considered unlocked after the server verifies it.
  useEffect(() => {
    if (window.location.pathname.replace(/\/+$/, "") !== "/demo") return;
    const savedPin = getDemoWhatsAppPin();
    if (!savedPin) return;

    let mounted = true;
    verifyDemoWhatsAppPin(savedPin).then((result) => {
      if (!mounted) return;
      if (result.success) {
        setDemoPinSaved(true);
        setDemoPin(savedPin);
        return;
      }
      clearDemoWhatsAppPin();
      setDemoPin("");
      setDemoPinSaved(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Handle Delete / Reset WhatsApp Bridge Data with beautiful popup cards
  const promptDeleteBridgeData = () => {
    setConfirmData({
      isOpen: true,
      title: "Delete WhatsApp Bridge Data?",
      message: "This will unlink your device, delete stored session credentials, and clear the authentication cache. You will need to click 'Connect to WhatsApp' to link a new device.",
      confirmText: "Delete & Reset",
      isDanger: true,
      isLoading: false,
      onConfirm: async () => {
        setConfirmData(prev => ({ ...prev, isLoading: true }));
        try {
          const res = await resetBridgeSession();
          const freshStatus = await getBridgeStatus(true);
          setBridgeStatus(freshStatus);
          setShowQrModal(false);
          setConfirmData({ isOpen: false, title: "", message: "" });

          setPopupData({
            isOpen: true,
            title: "WhatsApp Bridge Data Deleted",
            message: res.success
              ? "All stored WhatsApp Web credentials and local session data were safely deleted. Your bridge is now cleanly reset."
              : (res.error || "Reset command was dispatched to the WhatsApp Bridge."),
            type: res.success ? "success" : "warning",
            details: [
              "Linked device unlinked and auth tokens removed",
              "Bridge memory cache purged",
              "Click 'Connect to WhatsApp' whenever you want to scan a new QR code"
            ]
          });
        } catch (err: any) {
          setConfirmData({ isOpen: false, title: "", message: "" });
          setPopupData({
            isOpen: true,
            title: "Error Deleting Session",
            message: err.message || "Failed to reach WhatsApp Bridge.",
            type: "error"
          });
        }
      }
    });
  };

  // 100% Automated Background Blast
  const startAutomatedBlast = async () => {
    if (isBlasting) return;
    const latestBridgeStatus = await getBridgeStatus(true);
    setBridgeStatus(latestBridgeStatus);

    if (!consentConfirmed) {
      setPopupData({
        isOpen: true,
        title: "WhatsApp consent required",
        message: "Confirm that every selected customer has explicitly opted in to receive WhatsApp messages from this business.",
        type: "warning"
      });
      return;
    }

    if (totalCount === 0) {
      setPopupData({
        isOpen: true,
        title: "No eligible recipients",
        message: "No selected customer has an explicit WhatsApp opt-in. Open a customer profile and record consent first.",
        type: "warning"
      });
      return;
    }

    if (!(latestBridgeStatus.online && latestBridgeStatus.isReady)) {
      setPopupData({
        isOpen: true,
        title: "WhatsApp Bridge is offline",
        message: "Connect WhatsApp from this shop. The cloud worker will start or resume the persistent WhatsApp session.",
        type: "error"
      });
      return;
    }

    setIsBlasting(true);
    setBlastDone(false);
    completionRecorded.current = false;
    if (blastIntervalRef.current) clearInterval(blastIntervalRef.current);

    // If bridge is active and ready: use real WhatsApp Web automation
    if (latestBridgeStatus.online && latestBridgeStatus.isReady) {
      const res = await startBridgeBlast(
        sendList.map(c => ({ id: c.id, name: c.name, phone: c.phone })),
        currentMessage,
        campaign.name,
        5000,
        true
      );

      if (!res.success) {
        setIsBlasting(false);
        setPopupData({
          isOpen: true,
          title: "Blast Could Not Start",
          message: res.error || "Please ensure WhatsApp is connected and port 5001 is running.",
          type: "error"
        });
        return;
      }

      // Poll real-time progress from the bridge
      blastIntervalRef.current = setInterval(async () => {
        const progress = await getBlastProgress();
        if (progress) {
          setSentCount(progress.sentCount);
          if (progress.currentIndex >= 0 && progress.results[progress.currentIndex]) {
            setCurrentSendingName(progress.results[progress.currentIndex].name);
          }
          setSendList(prev =>
            prev.map(c => {
              const match = progress.results.find(r => String(r.id) === String(c.id));
              if (match) return { ...c, status: match.status as SendStatus, error: match.error || undefined };
              return c;
            })
          );

          if (!progress.isRunning) {
            if (blastIntervalRef.current) clearInterval(blastIntervalRef.current);
            setIsBlasting(false);
            const sentRecipientIds = progress.results
              .filter((result) => result.status === "sent")
              .map((result) => Number(result.id));
            if (!completionRecorded.current) {
              completionRecorded.current = true;
              onComplete(sentRecipientIds.length, sentRecipientIds, currentMessage);
            }
            setBlastDone(sentRecipientIds.length > 0);
            setCurrentSendingName("");
          }
        }
      }, 1000);
    }

 };

  const handleCancelBlast = async () => {
    if (blastIntervalRef.current) {
      clearInterval(blastIntervalRef.current);
    }
    if (bridgeStatus.online) {
      await cancelBridgeBlast();
    }
    setIsBlasting(false);
    setCurrentSendingName("");
  };

  // Send single customer automatically
  const handleSendSingle = async (customer: WACustomer) => {
    if (bridgeStatus.online && bridgeStatus.isReady) {
      setSendList(prev => prev.map(c => c.id === customer.id ? { ...c, status: "sending" } : c));
      const res = await sendSingleViaBridge(customer.phone, currentMessage, customer.name, true);
      if (res.success) {
        setSendList(prev => prev.map(c => c.id === customer.id ? { ...c, status: "sent" } : c));
        setSentCount(prev => Math.min(prev + 1, totalCount));
        onComplete(1, [customer.id], currentMessage);
      } else {
        setSendList(prev => prev.map(c => c.id === customer.id ? { ...c, status: "failed", error: res.error } : c));
        setPopupData({
          isOpen: true,
          title: "Send Failed",
          message: res.error || `Could not deliver message to ${customer.name}.`,
          type: "error"
        });
      }
    } else {
      setShowGuide(true);
    }
  };

  const statusIcon = (s: SendStatus) => {
    if (s === "pending") return <span style={{ fontSize: 12, color: "#94A3B8" }}>⏳ Pending</span>;
    if (s === "sending") return <span style={{ fontSize: 12, color: "#0D9488", fontWeight: 700 }}>⚡ Sending...</span>;
    if (s === "sent") return <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 700 }}>✓ Submitted</span>;
    if (s === "failed") return <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 700 }}>✕ Failed</span>;
    if (s === "opened") return <span style={{ fontSize: 12, color: "#0284C7", fontWeight: 700 }}>✓✓ Read</span>;
    return null;
  };

  const progress = totalCount > 0 ? Math.round((sentCount / totalCount) * 100) : 0;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal"
          style={{ maxWidth: 640, maxHeight: "94vh", display: "flex", flexDirection: "column" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-header" style={{ flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: "linear-gradient(135deg, #25D366, #128C7E)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                boxShadow: "0 4px 12px rgba(37,211,102,0.35)", color: "#fff"
              }}>📱</div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Automated WhatsApp Blast
                  </h3>
                  {bridgeStatus.online && bridgeStatus.isReady ? (
                    <span style={{ fontSize: 11, background: "#DCFCE7", color: "#15803D", padding: "2px 8px", borderRadius: 20, fontWeight: 700, border: "1px solid #86EFAC" }}>
                      ● Connected: {bridgeStatus.clientInfo?.name || "Ready"}
                    </span>
                  ) : bridgeStatus.online && bridgeStatus.hasQr ? (
                    <span style={{ fontSize: 11, background: "#FEF9C3", color: "#854D0E", padding: "2px 8px", borderRadius: 20, fontWeight: 700, border: "1px solid #FDE047" }}>
                      ● QR Ready
                    </span>
                  ) : bridgeStatus.online ? (
                    <span style={{ fontSize: 11, background: "#EFF6FF", color: "#1D4ED8", padding: "2px 8px", borderRadius: 20, fontWeight: 700, border: "1px solid #BFDBFE" }}>
                      ● Sandbox Starting
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, background: "#F1F5F9", color: "#64748B", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                      ● Sandbox Offline
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                  {campaign.name} • {totalCount} recipients ({campaign.audience})
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--muted-foreground)", lineHeight: 1 }}>✕</button>
          </div>

          <div className="modal-body" style={{ overflowY: "auto", paddingTop: 16 }}>
            {window.location.pathname.replace(/\/+$/, "") === "/demo" && (
              <div style={{ marginBottom: 14, padding: 12, background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 7, color: "#9A3412" }}>Private Demo WhatsApp Test</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="password"
                    value={demoPin}
                    onChange={(e) => setDemoPin(e.target.value)}
                    placeholder="Enter demo PIN"
                    style={{ flex: "1 1 220px", minWidth: 180, padding: "8px 10px", borderRadius: 8, border: "1px solid #FDBA74" }}
                  />
                  <button
                    className="btn-secondary"
                    disabled={!demoPin.trim()}
                    onClick={async () => {
                      const candidate = demoPin.trim();
                      if (!candidate) return;

                      const result = await verifyDemoWhatsAppPin(candidate);
                      if (!result.success) {
                        clearDemoWhatsAppPin();
                        setDemoPinSaved(false);
                        setPopupData({
                          isOpen: true,
                          title: "Invalid Demo PIN",
                          message: result.error || "That PIN is not valid. Enter demo PIN 7439.",
                          type: "error"
                        });
                        return;
                      }

                      setDemoWhatsAppPin(candidate);
                      setDemoPinSaved(true);
                      setPopupData({
                        isOpen: true,
                        title: "Demo WhatsApp unlocked",
                        message: "PIN 7439 verified. You can now connect the demo WhatsApp Sandbox worker.",
                        type: "success"
                      });
                    }}
                  >
                    Unlock
                  </button>
                  {demoPinSaved && (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#15803D" }}>✓ PIN verified</span>
                      <button className="btn-secondary" onClick={() => { clearDemoWhatsAppPin(); setDemoPin(""); setDemoPinSaved(false); }}>Lock</button>
                    </>
                  )}
                </div>
                <div style={{ marginTop: 7, fontSize: 11, color: "#9A3412" }}>This is only for testing your own WhatsApp connection on the demo. The PIN stays in this browser session.</div>
              </div>
            )}

            {/* Polished WhatsApp Bridge Status Banner */}
            <div style={{
              background: bridgeStatus.isReady ? "#F0FDF4" : "#F8FAFC",
              border: "1px solid",
              borderColor: bridgeStatus.isReady ? "#BBF7D0" : "var(--border)",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 10,
              fontSize: 12
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{bridgeStatus.isReady ? "✅" : bridgeStatus.hasQr ? "📲" : "⚡"}</span>
                <div>
                  <div style={{ fontWeight: 700, color: "#0F172A" }}>
                    {bridgeStatus.isReady
                      ? `WhatsApp Connected (${bridgeStatus.clientInfo?.name || "Linked Device"})`
                      : bridgeStatus.hasQr
                      ? "Pairing QR Code Ready"
                      : "Vercel Sandbox Worker"}
                  </div>
                  <div style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 1 }}>
                    {bridgeStatus.isReady
                      ? "Connected. Messages are dispatched by the persistent Vercel Sandbox worker."
                      : bridgeStatus.hasQr
                      ? "The QR is ready. Scan it with WhatsApp → Linked Devices."
                      : "Click Connect to start or resume the Vercel Sandbox WhatsApp session."}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* CONNECT TO WHATSAPP BUTTON: Shows QR modal ONLY when user explicitly clicks */}
                {!bridgeStatus.isReady && (
                  <button
                    onClick={async () => {
                      if (window.location.pathname.replace(/\/+$/, "") === "/demo" && !demoPinSaved) {
                        setPopupData({ isOpen: true, title: "Demo WhatsApp PIN required", message: "Verify demo PIN 7439 before connecting the Vercel Sandbox WhatsApp worker.", type: "warning" });
                        return;
                      }
                      const result = await connectBridgeSession();
                      if (!result.success) {
                        setShowQrModal(false);
                        setPopupData({ isOpen: true, title: "Vercel Sandbox WhatsApp Connection", message: result.error || "Unable to start the Vercel Sandbox WhatsApp session.", type: "error" });
                        return;
                      }
                      setShowQrModal(true);
                    }}
                    style={{
                      background: "linear-gradient(135deg, #25D366, #128C7E)",
                      border: "none",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      boxShadow: "0 2px 8px rgba(37,211,102,0.3)"
                    }}
                  >
                    <span>📱</span> {showQrModal ? "Hide QR" : "Connect to WhatsApp"}
                  </button>
                )}

                {/* DELETE / RESET BRIDGE DATA BUTTON */}
                {(bridgeStatus.isReady || bridgeStatus.hasQr) && (
                  <button
                    onClick={promptDeleteBridgeData}
                    style={{
                      background: "#FEF2F2",
                      border: "1px solid #FECACA",
                      color: "#DC2626",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <span>🗑️</span> Reset Bridge Data
                  </button>
                )}

                <button
                  onClick={() => setShowGuide(!showGuide)}
                  style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
                >
                  {showGuide ? "Hide Setup" : "Setup Guide"}
                </button>
              </div>
            </div>

            {/* QR Code view: ONLY when user clicked 'Connect to WhatsApp' */}
            {showQrModal && (
              <div style={{
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                borderRadius: 14,
                padding: 18,
                textAlign: "center",
                marginBottom: 16,
                position: "relative"
              }}>
                <button
                  onClick={() => setShowQrModal(false)}
                  style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#92400E" }}
                >
                  ✕
                </button>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#92400E", marginBottom: 4 }}>
                  Scan to Link Your WhatsApp Web
                </div>
                <div style={{ fontSize: 12, color: "#B45309", marginBottom: 14 }}>
                  Open WhatsApp on phone → <strong>Settings</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong>
                </div>

                {bridgeStatus.qrDataUrl ? (
                  <div style={{ display: "inline-block", padding: 8, background: "#fff", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                    <img src={bridgeStatus.qrDataUrl} alt="WhatsApp QR Code" style={{ width: 190, height: 190, display: "block" }} />
                  </div>
                ) : bridgeStatus.initializationError ? (
                  <div style={{ padding: "24px 20px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, maxWidth: 360, margin: "0 auto" }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>⚠️</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#991B1B" }}>WhatsApp worker needs attention</div>
                    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 5, lineHeight: 1.5 }}>{bridgeStatus.initializationError}</div>
                    <button
                      className="btn-secondary"
                      style={{ marginTop: 12 }}
                      onClick={async () => {
                        const result = await connectBridgeSession();
                        if (!result.success) {
                          setPopupData({
                            isOpen: true,
                            title: "WhatsApp connection retry failed",
                            message: result.error || "Unable to restart the Vercel Sandbox worker.",
                            type: "error"
                          });
                          return;
                        }
                        const fresh = await getBridgeStatus(true);
                        setBridgeStatus(fresh);
                      }}
                    >
                      Retry connection
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: "30px 20px", background: "rgba(255,255,255,0.6)", borderRadius: 12, maxWidth: 300, margin: "0 auto" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>
                      {bridgeStatus.connectionState === "PAIRING" ? "Waiting for pairing QR..." : "Starting WhatsApp worker..."}
                    </div>
                    <div style={{ fontSize: 11, color: "#B45309", marginTop: 4 }}>
                      The Vercel Sandbox worker is running. The QR will appear automatically when WhatsApp Web finishes starting.
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 11, color: "#92400E", marginTop: 12 }}>
                  ✓ This window will automatically close and show <strong>Connected</strong> once scanned.
                </div>
              </div>
            )}

            {/* Quick Bridge Setup Guide */}
            {showGuide && (
              <div style={{ background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: "#1E293B", marginBottom: 8, fontSize: 13 }}>
                  How ReBook WhatsApp Worker Works
                </div>
                <ol style={{ paddingLeft: 18, margin: "0 0 10px 0", color: "#334155", lineHeight: 1.7 }}>
                  <li>ReBook starts the WhatsApp worker in a persistent Vercel Sandbox.</li>
                  <li>Click <strong>Connect to WhatsApp</strong> and wait for the QR code.</li>
                  <li>Scan the QR code using WhatsApp → Linked Devices.</li>
                  <li>Keep this ReBook workspace open while the worker is active.</li>
                </ol>
                <div style={{ fontSize: 11, color: "#64748B", background: "rgba(255,255,255,0.5)", padding: "6px 10px", borderRadius: 8 }}>
                  💡 <em>Zero paid Meta API keys required. Operates directly with regular WhatsApp Web.</em>
                </div>
              </div>
            )}

            {/* Message preview / edit */}
            <div style={{ background: "#F0FDF4", border: "1px solid #A7F3D0", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#065F46", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Campaign Message Template
                </div>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  disabled={isBlasting}
                  style={{ background: "none", border: "none", color: "#047857", fontSize: 12, fontWeight: 600, cursor: isBlasting ? "not-allowed" : "pointer", textDecoration: "underline" }}
                >
                  {isEditing ? "Done Editing" : "Edit Template"}
                </button>
              </div>

              {isEditing ? (
                <textarea
                  className="input"
                  style={{ minHeight: 80, fontSize: 13, lineHeight: 1.5, background: "#fff", resize: "vertical" }}
                  value={currentMessage}
                  onChange={e => setCurrentMessage(e.target.value)}
                />
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "#065F46" }}>
                  {currentMessage.replace("{name}", "there")}
                </div>
              )}
              <div style={{ fontSize: 11, color: "#047857", marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                <span>Replaces <code>&#123;name&#125;</code> with customer's first name.</span>
                <span>{currentMessage.length} chars</span>
              </div>
            </div>

            {/* Primary Blast Action Card */}
            <div style={{
              background: blastDone ? "#F0FDF4" : isBlasting ? "#ECFDF5" : "#F8FAFC",
              border: "1px solid",
              borderColor: blastDone ? "#86EFAC" : isBlasting ? "#34D399" : "var(--border)",
              borderRadius: 14, padding: "18px", marginBottom: 16, textAlign: "center"
            }}>
              {blastDone ? (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>🎉</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#15803D", marginBottom: 4 }}>
                    Automated Blast Completed!
                  </div>
                  <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.5, marginBottom: 12 }}>
Submitted {totalCount} messages to the local WhatsApp session. WhatsApp delivery/read status is not guaranteed by this bridge.
                  </div>
                  <button
                    onClick={startAutomatedBlast}
                    style={{
                      padding: "8px 20px", borderRadius: 8, border: "1px solid #86EFAC",
                      background: "#fff", color: "#15803D", fontSize: 13, fontWeight: 700, cursor: "pointer"
                    }}
                  >
                    🚀 Run Blast Again
                  </button>
                </div>
              ) : isBlasting ? (
                <div>
                  <div style={{ fontSize: 26, marginBottom: 6 }}>⚡</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#065F46", marginBottom: 4 }}>
                    Automated Blast In Progress...
                  </div>
                  <div style={{ fontSize: 13, color: "#047857", marginBottom: 14 }}>
                    {currentSendingName ? (
                      <span>Sending to <strong>{currentSendingName}</strong></span>
                    ) : (
                      <span>Processing automated queue ({sentCount}/{totalCount})...</span>
                    )}
                  </div>
                  <button
                    onClick={handleCancelBlast}
                    style={{
                      padding: "8px 20px", borderRadius: 8, border: "1px solid #FCA5A5",
                      background: "#FEE2E2", color: "#DC2626", fontSize: 13, fontWeight: 700, cursor: "pointer"
                    }}
                  >
                    ⏹️ Stop Blast
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 14, padding: "12px 14px", background: "#F0FDF4", border: "1px solid #A7F3D0", borderRadius: 10 }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "#334155", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={consentConfirmed}
                      onChange={(e) => setConsentConfirmed(e.target.checked)}
                      disabled={totalCount === 0 || isBlasting}
                      style={{ marginTop: 2 }}
                    />
                    <span><strong>Consent confirmed:</strong> every recipient in this queue has explicitly opted in to receive WhatsApp messages from this business.</span>
                  </label>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ fontSize: 13, color: "var(--muted-foreground)", textAlign: "left" }}>
                      Target: <strong>{totalCount} customers</strong> ({campaign.audience})
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
                      <span>Pacing:</span>
                    <span style={{ fontWeight: 700 }}>5s / message</span>
                    </div>
                  </div>

                  <button
                    onClick={startAutomatedBlast}
                    style={{
                      width: "100%", padding: "14px 20px", borderRadius: 10, border: "none",
                      background: "linear-gradient(135deg, #25D366, #128C7E)",
                      color: "#fff", fontSize: 15, fontWeight: 800,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      boxShadow: "0 4px 16px rgba(37,211,102,0.4)",
                      transition: "transform 0.15s ease"
                    }}
                  >
                    <span style={{ fontSize: 20 }}>📱</span>
                    Start 100% Automated Blast
                  </button>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8 }}>
Sends one message at a time from the connected WhatsApp session. Only customers with recorded WhatsApp opt-in are eligible.
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                <span style={{ color: sentCount === totalCount ? "#15803D" : "var(--foreground)" }}>
                  {sentCount === totalCount ? `✓ All ${totalCount} customers sent!` : `Progress: ${sentCount} of ${totalCount}`}
                </span>
                <span style={{ color: "var(--muted-foreground)" }}>{progress}%</span>
              </div>
              <div className="progress-bar" style={{ height: 8 }}>
                <div className="progress-fill" style={{ width: `${progress}%`, height: "100%", transition: "width 0.3s ease", background: sentCount === totalCount ? "#10B981" : "linear-gradient(90deg,#25D366,#128C7E)" }} />
              </div>
            </div>

            {/* Customer Queue List */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                Recipients Queue ({totalCount})
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                One at a time · opt-in only
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
              {sendList.map(c => (
                <div key={c.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  background: c.status === "sent" ? "#F0FDF4" : c.status === "sending" ? "#EFF6FF" : "#fff",
                  borderRadius: 8, border: "1px solid",
                  borderColor: c.status === "sent" ? "#BBF7D0" : c.status === "sending" ? "#93C5FD" : "var(--border)",
                  transition: "all 0.2s ease"
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: "#DCFCE7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: "#15803D", flexShrink: 0
                  }}>{c.avatar}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{c.phone}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {statusIcon(c.status)}
                    <button
                      onClick={() => handleSendSingle(c)}
                      disabled={isBlasting}
                      style={{
                        padding: "5px 10px", borderRadius: 6, border: "none",
                        background: c.status === "sent" ? "#E2E8F0" : "linear-gradient(135deg, #25D366, #128C7E)",
                        color: c.status === "sent" ? "#475569" : "#fff", fontSize: 11, fontWeight: 700,
                        cursor: isBlasting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4,
                        opacity: isBlasting ? 0.6 : 1
                      }}
                    >
                      <span>💬</span> {c.status === "sent" ? "Resend" : "Send"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={isBlasting}>
                {blastDone ? "Close" : "Cancel"}
              </button>
              {!blastDone && (
                <button
                  onClick={startAutomatedBlast}
                  disabled={isBlasting}
                  style={{
                    flex: 1.5, padding: "10px 16px", borderRadius: 8, border: "none",
                    background: isBlasting ? "#94A3B8" : "linear-gradient(135deg, #25D366, #128C7E)",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    cursor: isBlasting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: isBlasting ? "none" : "0 2px 10px rgba(37,211,102,0.3)"
                  }}
                >
                  <span>📱</span> {isBlasting ? "Blasting in progress..." : `Start Blast to ${totalCount}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modern Pop-up Card replacing dirty browser alert */}
      <PopupCard
        isOpen={popupData.isOpen}
        onClose={() => setPopupData(prev => ({ ...prev, isOpen: false }))}
        title={popupData.title}
        message={popupData.message}
        type={popupData.type}
        details={popupData.details}
      />

      {/* Modern Confirm Dialog replacing window.confirm */}
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
    </>
  );
}

// --- Campaign Card with WhatsApp button ---
function CampaignCard({ c, onSendWA, onView, customers, bookings }: any) {
  const statusMap: Record<string, { label: string; class: string }> = {
    completed: { label: "Completed", class: "status-active" },
    active: { label: "Active", class: "status-active" },
    scheduled: { label: "Scheduled", class: "status-scheduled" },
    draft: { label: "Draft", class: "status-draft" },
  };

  const audience = resolveAudience(c.audience, customers, bookings);
  const convRate = c.sent > 0 ? Math.round((c.converted / c.sent) * 100) : 0;

  return (
    <div
      className="card"
      style={{ cursor: "pointer", transition: "all 0.15s ease", border: "1px solid var(--border)" }}
      onClick={() => onView(c)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{c.name}</span>
            <span className={`status-pill ${statusMap[c.status]?.class || "status-draft"}`}>
              {statusMap[c.status]?.label || c.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {c.channel} • {c.audience} ({audience.length} customers)
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          {new Date(c.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>

      {c.sent > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, paddingTop: 14, borderTop: "1px solid var(--border)", marginBottom: 14 }}>
          {[
            { label: "Submitted", value: c.sent },
            { label: "Recipients", value: audience.length },
            { label: "Converted", value: `${convRate}%` },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 18, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {c.status === "draft" && (
        <div style={{ paddingTop: 14, borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: 14 }}>
          Draft • Not yet sent
        </div>
      )}

      {/* WhatsApp Send Button */}
      <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSendWA(c);
          }}
          style={{
            width: "100%", padding: "9px 14px", borderRadius: 8, border: "none",
            background: "linear-gradient(135deg, #25D366, #128C7E)",
            color: "#fff", fontSize: 13, fontWeight: 700,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "0 2px 8px rgba(37,211,102,0.25)",
            transition: "all 0.15s ease"
          }}
        >
          <span style={{ fontSize: 16 }}>📱</span>
          Send to {audience.length} via WhatsApp
        </button>
      </div>
    </div>
  );
}

// --- Main Campaigns Page ---
export default function Campaigns() {
  const { customers, bookings, campaigns, addCampaign, recordBlastResults } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "", audience: audienceOptions[0], channel: "WhatsApp",
    message: "", scheduleDate: "", scheduleTime: "10:00"
  });

  // WhatsApp blast state
  const [waCampaign, setWACampaign] = useState<any>(null);
  const [waMessage, setWAMessage] = useState("");

  // Campaign detail view state
  const [detailCampaign, setDetailCampaign] = useState<any>(null);

  const audienceCount = resolveAudience(form.audience, customers, bookings).length;

  const openWABlast = (c: any) => {
    const defaultMsg = `Hi {name}! ✨ ${c.name} — Glam Studio has a special offer just for you. Don't miss out! Book now.`;
    setWACampaign(c);
    setWAMessage(c.message || defaultMsg);
  };

  const handleLaunchCampaign = () => {
    const newCampaign: Omit<Campaign, "id"> = {
      name: form.name.trim() || "Promotional Campaign",
      status: form.scheduleDate ? "scheduled" : "active",
      channel: form.channel,
      audience: form.audience,
      sent: 0,
      opened: 0,
      converted: 0,
      date: form.scheduleDate || new Date().toISOString().split("T")[0],
      message: form.message,
    };
    addCampaign(newCampaign);
    setShowModal(false);
    setStep(1);
    setForm({
      name: "", audience: audienceOptions[0], channel: "WhatsApp",
      message: "", scheduleDate: "", scheduleTime: "10:00"
    });
  };

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em", margin: 0 }}>Campaigns</h1>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>One-time broadcasts to your customer segments</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => openWABlast({ name: "Quick Blast", audience: "All Customers", channel: "WhatsApp" })}
            style={{
              padding: "9px 16px", borderRadius: 8, border: "none",
              background: "linear-gradient(135deg, #25D366, #128C7E)",
              color: "#fff", fontSize: 13, fontWeight: 700,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 2px 8px rgba(37,211,102,0.3)"
            }}
          >
            <span>📱</span> WhatsApp Blast
          </button>
          <button className="btn-primary" onClick={() => { setStep(1); setShowModal(true); }}>+ New Campaign</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Messages Submitted", value: campaigns.reduce((s, c) => s + c.sent, 0).toLocaleString(), icon: "📤" },
          { label: "Opted-in Customers", value: customers.filter((c) => c.whatsappOptIn === true).length.toLocaleString(), icon: "✅" },
          { label: "Total Converted", value: campaigns.reduce((s, c) => s + c.converted, 0).toLocaleString(), icon: "🎯" },
          { label: "Active Campaigns", value: campaigns.filter((c) => c.status === "active" || c.status === "scheduled").length.toLocaleString(), icon: "📣" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {campaigns.map(c => <CampaignCard key={c.id} c={c} customers={customers} bookings={bookings} onSendWA={openWABlast} onView={setDetailCampaign} />)}
      </div>

      {/* WhatsApp Blast Modal */}
      {waCampaign && (
        <WhatsAppBlastModal
          campaign={waCampaign}
          message={waMessage}
          customers={customers}
          bookings={bookings}
          onComplete={(sentCount, recipientIds, message) => {
            if (waCampaign?.id) recordBlastResults(waCampaign.id, sentCount, recipientIds, waCampaign.channel, message);
          }}
          onClose={() => setWACampaign(null)}
        />
      )}

      {/* Campaign Builder Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>New Campaign</h3>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>Step {step} of 3</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--muted-foreground)", lineHeight: 1 }}>✕</button>
            </div>

            <div className="modal-body">
              {step === 1 && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Campaign Name</label>
                    <input className="input" placeholder="e.g. Diwali Glam Special" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Target Audience</label>
                    <select className="input" value={form.audience} onChange={e => setForm(p => ({ ...p, audience: e.target.value }))}>
                      {audienceOptions.map(a => <option key={a}>{a}</option>)}
                    </select>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                      Estimated reach: <strong>{audienceCount} customers</strong>
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Channel</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {[
                        { id: "WhatsApp", label: "WhatsApp", icon: "📱", desc: "Opt-in required · Vercel Sandbox" },
                        { id: "SMS", label: "SMS", icon: "💬", desc: "Reliable fallback" },
                        { id: "Email", label: "Email", icon: "✉️", desc: "Best for newsletters" },
                      ].map(ch => (
                        <div
                          key={ch.id}
                          onClick={() => setForm(p => ({ ...p, channel: ch.id }))}
                          style={{
                            padding: "12px", borderRadius: 10, cursor: "pointer",
                            border: `2px solid ${form.channel === ch.id ? "var(--primary)" : "var(--border)"}`,
                            background: form.channel === ch.id ? "#F0FDFA" : "#fff",
                            textAlign: "center"
                          }}
                        >
                          <div style={{ fontSize: 20, marginBottom: 4 }}>{ch.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{ch.label}</div>
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{ch.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Message Template</label>
                    <textarea
                      className="input"
                      style={{ minHeight: 120, resize: "vertical" }}
                      placeholder="Hi {name}! ✨ Special offer just for you..."
                      value={form.message}
                      onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                      <span>Use <code>&#123;name&#125;</code> for personalized customer name</span>
                      <span>{form.message.length} chars</span>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Schedule Date</label>
                    <input className="input" type="date" value={form.scheduleDate} onChange={e => setForm(p => ({ ...p, scheduleDate: e.target.value }))} min="2026-09-13" />
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Send Time</label>
                    <select className="input" value={form.scheduleTime} onChange={e => setForm(p => ({ ...p, scheduleTime: e.target.value }))}>
                      {["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "16:00", "18:00", "20:00"].map(t => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Summary */}
                  <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Campaign Summary</div>
                    {[
                      { label: "Name", value: form.name || "Untitled" },
                      { label: "Audience", value: `${form.audience} (${audienceCount} people)` },
                      { label: "Channel", value: form.channel },
                      { label: "Schedule", value: form.scheduleDate ? `${form.scheduleDate} at ${form.scheduleTime}` : "Send now" },
                    ].map(s => (
                      <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ color: "var(--muted-foreground)" }}>{s.label}</span>
                        <span style={{ fontWeight: 500 }}>{s.value}</span>
                      </div>
                    ))}
                  </div>

                  {form.channel === "WhatsApp" && form.scheduleDate && (
                    <div style={{ marginTop: 12, padding: "12px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, fontSize: 12, color: "#92400E" }}>
                      WhatsApp scheduling is not executed by Vercel. The local WhatsApp bridge must be running at the scheduled time. Until a persistent scheduler is configured, treat this as a saved campaign plan rather than a guaranteed automated send.
                    </div>
                  )}

                  {form.channel === "WhatsApp" && (
                    <div style={{ marginTop: 16, padding: "12px 14px", background: "#F0FDF4", border: "1px solid #A7F3D0", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>📱</span>
                      <div style={{ flex: 1, fontSize: 13, color: "#065F46" }}>
                        <strong>WhatsApp channel selected.</strong> You can dispatch via the WhatsApp Blast button on the campaign card.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                {step > 1 && <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep(p => p - 1)}>Back</button>}
                {step < 3
                  ? <button className="btn-primary" style={{ flex: 1 }} onClick={() => setStep(p => p + 1)}>Continue</button>
                  : <button className="btn-primary" style={{ flex: 1 }} onClick={handleLaunchCampaign}>Launch Campaign</button>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Detail Modal */}
      {detailCampaign && (
        <div className="modal-overlay" onClick={() => setDetailCampaign(null)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{detailCampaign.name}</h3>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                  Created on {new Date(detailCampaign.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </div>
              </div>
              <button onClick={() => setDetailCampaign(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--muted-foreground)", lineHeight: 1 }}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Status", value: detailCampaign.status.toUpperCase(), color: "var(--primary)" },
                  { label: "Channel", value: detailCampaign.channel, color: "var(--foreground)" },
                  { label: "Audience", value: detailCampaign.audience, color: "var(--foreground)" },
                ].map(item => (
                  <div key={item.label} style={{ background: "#F8FAFC", padding: "12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {detailCampaign.sent > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20, background: "#F0FDF4", padding: "14px", borderRadius: 10, border: "1px solid #A7F3D0" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#065F46" }}>{detailCampaign.sent}</div>
                    <div style={{ fontSize: 11, color: "#047857" }}>Sent</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#065F46" }}>{detailCampaign.opened}</div>
                    <div style={{ fontSize: 11, color: "#047857" }}>Opened</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#065F46" }}>{detailCampaign.converted}</div>
                    <div style={{ fontSize: 11, color: "#047857" }}>Converted</div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Campaign Message</label>
                <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.6, border: "1px solid var(--border)", color: "var(--foreground)" }}>
                  {detailCampaign.message || `Hi {name}! ✨ Special offer from Glam Studio. Book today and enjoy exclusive discounts!`}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setDetailCampaign(null)}>Close</button>
                <button
                  style={{
                    flex: 1.4, padding: "10px 16px", borderRadius: 8, border: "none",
                    background: "linear-gradient(135deg, #25D366, #128C7E)",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: "0 2px 8px rgba(37,211,102,0.3)"
                  }}
                  onClick={() => {
                    const c = detailCampaign;
                    setDetailCampaign(null);
                    openWABlast(c);
                  }}
                >
                  <span>📱</span> Send via WhatsApp Blast
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
