import React, { useEffect, useState } from "react";
import { createBillingOrder, getBillingCycle, verifyBillingPayment } from "../services/shopApi";

declare global {
  interface Window {
    Razorpay?: new (options: any) => { open: () => void };
  }
}

async function loadRazorpayScript() {
  if (window.Razorpay) return true;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-rebook-razorpay="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay checkout.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.rebookRazorpay = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout."));
    document.body.appendChild(script);
  });
  return Boolean(window.Razorpay);
}

export default function Payment({ shopId, cycleId }: { shopId: string; cycleId: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const refresh = async () => {
    setLoading(true); setError("");
    try {
      const next = await getBillingCycle(shopId, cycleId);
      setData(next);
      setPaid(next.cycle.status === "paid");
    } catch (e: any) { setError(e.message || "Unable to load payment."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [shopId, cycleId]);

  const startPayment = async () => {
    setPaying(true); setError("");
    try {
      await loadRazorpayScript();
      const order = await createBillingOrder(shopId, cycleId);
      if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable.");
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        name: "ReBook",
        description: `${data.shop.shopName} — 30-day subscription`,
        order_id: order.orderId,
        prefill: { name: data.shop.ownerName, email: data.shop.ownerEmail, contact: data.shop.phone },
        notes: { shopId, cycleId },
        theme: { color: "#0D9488" },
        handler: async (response: any) => {
          try {
            await verifyBillingPayment({ shopId, cycleId, ...response });
            setPaid(true);
            await refresh();
          } catch (e: any) {
            setError(e.message || "Payment verification failed. Please wait for confirmation.");
          } finally { setPaying(false); }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (e: any) {
      setError(e.message || "Unable to start payment.");
      setPaying(false);
    }
  };

  if (loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Loading payment…</div>;
  if (error && !data) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}><div className="stat-card" style={{ padding: 24, maxWidth: 520 }}>{error}</div></div>;

  const cycle = data.cycle;
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--background)" }}>
      <div className="stat-card" style={{ width: "100%", maxWidth: 520, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "var(--muted-foreground)" }}>ReBook subscription</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0 4px" }}>{data.shop.shopName}</h1>
        <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>30-day access · Secure checkout powered by Razorpay</div>
        <div style={{ fontSize: 34, fontWeight: 900, marginTop: 20 }}>₹{Number(cycle.amount || 0).toLocaleString("en-IN")}</div>
        {paid ? (
          <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>
            Payment received. You can return to your ReBook app.
          </div>
        ) : (
          <>
            <button className="btn-primary" style={{ marginTop: 20, minWidth: 220 }} disabled={paying} onClick={startPayment}>
              {paying ? "Opening payment…" : "Pay & Activate"}
            </button>
            {error && <div style={{ marginTop: 14, fontSize: 13, color: "#B91C1C" }}>{error}</div>}
          </>
        )}
        <div style={{ marginTop: 20, fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          By continuing, you acknowledge the ReBook <a href="/terms">Terms of Service</a>, <a href="/privacy-policy">Privacy Policy</a> and <a href="/refund-policy">Refund & Cancellation Policy</a>.
        </div>
        <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", fontSize: 11 }}>
          <a href="/contact">Contact</a>
          <a href="/about">About ReBook</a>
        </div>
      </div>
    </div>
  );
}
