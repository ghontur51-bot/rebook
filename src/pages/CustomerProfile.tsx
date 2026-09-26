import { useState, useEffect } from "react";
import { useApp, isRepeatCustomer } from "../context/AppContext";
import { sendSingleViaBridge, getBridgeStatus } from "../services/whatsappBridgeService";
import { PopupCard } from "../components/ModalCard";

interface Customer {
  id: number; name: string; phone: string; email: string; status: string;
  lastVisit: string; totalVisits: number; totalSpend: number; favouriteService: string;
  tags: string[]; notes: string; avatar: string;
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string;
  whatsappOptInSource?: string;
}

const TODAY = new Date();
const SERVICES = ["Hair Colour & Highlights","Keratin Treatment","Facial & Cleanup","Blow Dry & Styling","Hair Spa","Bridal Package","Threading & Waxing","Balayage","Manicure & Pedicure","Nail Art"];
const STAFF = ["Sonal", "Rupa", "Meena", "Divya"];

const SERVICE_PRICES: Record<string, number> = {
  "Hair Colour & Highlights": 2800,
  "Keratin Treatment": 3200,
  "Facial & Cleanup": 1500,
  "Manicure & Pedicure": 1200,
  "Blow Dry & Styling": 600,
  "Hair Spa": 1200,
  "Bridal Package": 15000,
  "Threading & Waxing": 700,
  "Balayage": 4500,
  "Nail Art": 1400,
};

// State for modern popup
export default function CustomerProfile({ customer, onBack }: { customer: Customer; onBack: () => void }) {
  const { bookings, visitHistory, addBooking, updateCustomer, getCustomerMessages, logCustomerMessage } = useApp();
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState(customer.notes);
  const [editingNote, setEditingNote] = useState(false);
  const [sendModal, setSendModal] = useState(false);
  const [popupData, setPopupData] = useState<{ isOpen: boolean; title: string; message: string; type?: "success" | "error" | "info" | "warning" }>({ isOpen: false, title: "", message: "", type: "success" });
  const [sendChannel, setSendChannel] = useState("WhatsApp");
  const [whatsappConsentConfirmed, setWhatsappConsentConfirmed] = useState(false);
  const [message, setMessage] = useState(`Hi ${customer.name.trim().split(" ")[0]}! We miss you at Glam Studio 💖 Come back this week and get 15% off on any service. Book now!`);

  // Book Appointment
  const [bookModal, setBookModal] = useState(false);
  const [bookForm, setBookForm] = useState({ service: SERVICES[0], date: TODAY.toISOString().split("T")[0], time: "10:00 AM", staff: STAFF[0] });
  const [bookSuccess, setBookSuccess] = useState(false);

  // Tags
  const [tags, setTags] = useState<string[]>(customer.tags || []);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Sync state cleanly when customer changes to completely prevent cross-customer data leakage
  useEffect(() => {
    setNote(customer.notes || "");
    setTags(customer.tags || []);
    setMessage(`Hi ${customer.name.trim().split(" ")[0]}! We miss you at Glam Studio 💖 Come back this week and get 15% off on any service. Book now!`);
    setWhatsappConsentConfirmed(false);
    setEditingNote(false);
    setBookForm({
      service: SERVICES[0],
      date: TODAY.toISOString().split("T")[0],
      time: "10:00 AM",
      staff: STAFF[0],
    });
  }, [customer.id, customer.name, customer.notes, customer.tags]);

  const visits = visitHistory[customer.id as keyof typeof visitHistory] || [];
  const daysSince = Math.floor((TODAY.getTime() - new Date(customer.lastVisit).getTime()) / 86400000);

  const statusColor = customer.status === "active" ? "#DCFCE7" : customer.status === "won_back" ? "#DBEAFE" : "#FEF3C7";
  const statusTextColor = customer.status === "active" ? "#15803D" : customer.status === "won_back" ? "#1D4ED8" : "#D97706";
  const lifecycle = isRepeatCustomer(customer, bookings) ? "Repeat" : "New";
  const customTags = tags.filter((tag) => !["new", "repeat"].includes(tag.trim().toLowerCase()));

  const handleBooking = () => {
    const amount = SERVICE_PRICES[bookForm.service] || 1500;
    addBooking({
      customer: customer.name,
      customerId: customer.id,
      customerPhone: customer.phone,
      service: bookForm.service,
      date: bookForm.date,
      time: bookForm.time,
      staff: bookForm.staff,
      amount,
      status: "confirmed",
    });
    setBookSuccess(true);
    setTimeout(() => { setBookSuccess(false); setBookModal(false); }, 1400);
  };

  const handleAddTag = () => {
    const normalizedTag = newTag.trim().toLowerCase();
    if (["new", "repeat"].includes(normalizedTag)) {
      setNewTag("");
      setAddingTag(false);
      return;
    }
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      const nextTags = [...tags, newTag.trim()];
      setTags(nextTags);
      updateCustomer(customer.id, { tags: nextTags });
    }
    setNewTag("");
    setAddingTag(false);
  };

  return (
    <div style={{ padding: "32px" }}>
      {/* Back */}
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: 14, padding: 0, marginBottom: 20, display: "flex", alignItems: "center", gap: 6 }}>
        ← Back to Customers
      </button>

      {/* Header Card */}
      <div style={{ background: "#fff", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "28px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: statusColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: statusTextColor, flexShrink: 0 }}>
            {customer.avatar}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}>{customer.name}</h2>
              <span className={`badge ${customer.status === "active" ? "badge-green" : customer.status === "won_back" ? "badge-blue" : "badge-amber"}`}>
                {customer.status === "won_back" ? "Won Back" : customer.status.charAt(0).toUpperCase() + customer.status.slice(1)}
              </span>
              <span className={`badge ${lifecycle === "Repeat" ? "badge-blue" : "badge-gray"}`}>
                {lifecycle}
              </span>
            </div>
            <div style={{ display: "flex", gap: 20, fontSize: 13, color: "var(--muted-foreground)", flexWrap: "wrap" }}>
              <span>📱 {customer.phone}</span>
              <span>✉ {customer.email}</span>
              <span>📅 Last visit: {new Date(customer.lastVisit).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} ({daysSince} days ago)</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setBookModal(true)}>📅 Book Appointment</button>
            <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setSendModal(true)}>💬 Send Message</button>
          </div>
        </div>

        {/* Quick Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
          {[
            { label: "Total Visits", value: customer.totalVisits, icon: "📊" },
            { label: "Total Spend", value: `₹${customer.totalSpend.toLocaleString()}`, icon: "💰" },
            { label: "Avg per Visit", value: `₹${customer.totalVisits > 0 ? Math.round(customer.totalSpend / customer.totalVisits).toLocaleString() : "0"}`, icon: "📈" },
            { label: "Favourite Service", value: customer.favouriteService, icon: "⭐", small: true },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: s.small ? 13 : 20, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: s.small ? 0 : "-0.02em" }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Left */}
        <div>
          {/* Tabs */}
          <div style={{ background: "#fff", borderRadius: "var(--radius)", border: "1px solid var(--border)", overflow: "hidden" }}>
            <div className="tab-bar" style={{ padding: "0 20px" }}>
              {["overview", "visits", "messages"].map(t => (
                <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)} style={{ textTransform: "capitalize" }}>{t}</div>
              ))}
            </div>

            <div style={{ padding: "20px" }}>
              {tab === "overview" && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Tags</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {customTags.map(t => (
                        <span key={t} className="badge badge-gray" style={{ fontSize: 13, padding: "4px 12px" }}>{t}</span>
                      ))}
                      {addingTag ? (
                        <>
                          <input
                            autoFocus
                            className="input"
                            style={{ width: 120, padding: "3px 10px", fontSize: 13 }}
                            placeholder="Tag name"
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleAddTag(); if (e.key === "Escape") { setAddingTag(false); setNewTag(""); } }}
                          />
                          <button onClick={handleAddTag} className="btn-primary" style={{ fontSize: 12, padding: "4px 10px" }}>Add</button>
                          <button onClick={() => { setAddingTag(false); setNewTag(""); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted-foreground)", lineHeight: 1 }}>×</button>
                        </>
                      ) : (
                        <button onClick={() => setAddingTag(true)} style={{ padding: "4px 12px", borderRadius: 99, border: "1px dashed var(--border)", fontSize: 13, cursor: "pointer", background: "none", color: "var(--muted-foreground)" }}>+ Add Tag</button>
                      )}
                    </div>
                  </div>
                  <div style={{ marginTop: 18, padding: "14px", background: customer.whatsappOptIn ? "#F0FDF4" : "#FFFBEB", border: `1px solid ${customer.whatsappOptIn ? "#A7F3D0" : "#FDE68A"}`, borderRadius: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>WhatsApp messaging consent</div>
                        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3 }}>
                          {customer.whatsappOptIn
                            ? `Opted in${customer.whatsappOptInAt ? ` on ${new Date(customer.whatsappOptInAt).toLocaleDateString("en-IN")}` : ""}.`
                            : "No explicit WhatsApp opt-in recorded. Sending is blocked until consent is recorded."}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const next = !customer.whatsappOptIn;
                          updateCustomer(customer.id, {
                            whatsappOptIn: next,
                            whatsappOptInAt: next ? new Date().toISOString() : undefined,
                            whatsappOptInSource: next ? "ReBook customer profile" : undefined,
                          });
                        }}
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: "7px 12px" }}
                      >
                        {customer.whatsappOptIn ? "Opt out" : "Record opt-in"}
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Notes</div>
                      <button onClick={() => { if (editingNote) updateCustomer(customer.id, { notes: note }); setEditingNote(!editingNote); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--primary)", fontWeight: 500 }}>
                        {editingNote ? "Save" : "Edit"}
                      </button>
                    </div>
                    {editingNote ? (
                      <textarea className="input" style={{ minHeight: 100, resize: "vertical" }} value={note} onChange={e => setNote(e.target.value)} />
                    ) : (
                      <div style={{ fontSize: 14, color: note ? "var(--foreground)" : "var(--muted-foreground)", lineHeight: 1.6, padding: "12px", background: "#F8FAFC", borderRadius: 8 }}>
                        {note || "No notes added yet. Click Edit to add notes about this customer."}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "visits" && (
                <div>
                  {visits.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {visits.map((v, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px", background: "#F8FAFC", borderRadius: 10 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#E0FDF4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>✂</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{v.service}</div>
                            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>by {v.staff} · {new Date(v.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }}>₹{v.amount.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "32px", color: "var(--muted-foreground)" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                      <div style={{ fontWeight: 600 }}>No detailed visit history</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>Visit data will appear here after integration</div>
                    </div>
                  )}
                </div>
              )}

              {tab === "messages" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {getCustomerMessages(customer.id).map((m, i) => (
                    <div key={i} style={{ padding: "14px", background: "#F8FAFC", borderRadius: 10, borderLeft: "3px solid var(--primary)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span className="badge badge-blue" style={{ fontSize: 11 }}>{m.channel}</span>
                        {m.opened && <span className="badge badge-green" style={{ fontSize: 11 }}>Opened</span>}
                        <span style={{ fontSize: 12, color: "var(--muted-foreground)", marginLeft: "auto" }}>{m.date}</span>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{m.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Automation Status */}
          <div className="stat-card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>⚡ Automation Status</div>
            {daysSince >= 60 ? (
              <div style={{ padding: "12px", background: "#FEF3C7", borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#D97706" }}>60-Day Win-Back Active</div>
                <div style={{ fontSize: 12, color: "#92400E", marginTop: 2 }}>Message scheduled to send today</div>
              </div>
            ) : (
              <div style={{ padding: "12px", background: "#F0FDF4", borderRadius: 8, marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#15803D" }}>30-Day Nudge Active</div>
                <div style={{ fontSize: 12, color: "#166534", marginTop: 2 }}>{daysSince} days since last visit</div>
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>2 automations watching this customer</div>
          </div>

          {/* Spend Progress */}
          <div className="stat-card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>💎 Customer Value</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: "var(--muted-foreground)" }}>Total Spend</span>
                <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>₹{customer.totalSpend.toLocaleString()}</span>
              </div>
              <div className="progress-bar" style={{ height: 6 }}>
                <div className="progress-fill" style={{ width: `${Math.min((customer.totalSpend / 30000) * 100, 100)}%`, height: "100%" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>₹30,000 = Elite tier</div>
            </div>
            {[
              { label: "This year", value: `₹${Math.round(customer.totalSpend * 0.6).toLocaleString()}` },
              { label: "Avg visit value", value: `₹${customer.totalVisits > 0 ? Math.round(customer.totalSpend / customer.totalVisits).toLocaleString() : "0"}` },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                <span style={{ color: "var(--muted-foreground)" }}>{s.label}</span>
                <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Send Message Modal */}
      {sendModal && (
        <div className="modal-overlay" onClick={() => setSendModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Send Message</h3>
              <button onClick={() => setSendModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted-foreground)", lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>To</label>
                <div style={{ padding: "9px 14px", background: "#F8FAFC", borderRadius: 8, fontSize: 14, border: "1px solid var(--border)" }}>{customer.name} · {customer.phone}</div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Channel</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["WhatsApp", "SMS", "Email"].map(ch => (
                    <button key={ch} onClick={() => setSendChannel(ch)} style={{
                      padding: "7px 14px", borderRadius: 8, border: "1px solid",
                      borderColor: sendChannel === ch ? "var(--primary)" : "var(--border)",
                      background: sendChannel === ch ? (ch === "WhatsApp" ? "linear-gradient(135deg,#25D366,#128C7E)" : "var(--primary)") : "#fff",
                      color: sendChannel === ch ? "#fff" : "var(--foreground)",
                      fontSize: 13, cursor: "pointer", fontWeight: 600, transition: "all 0.15s"
                    }}>{ch === "WhatsApp" ? "📱 WhatsApp" : ch === "SMS" ? "💬 SMS" : "✉ Email"}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Message</label>
                <textarea className="input" style={{ minHeight: 120, resize: "vertical", lineHeight: 1.6 }} value={message} onChange={e => setMessage(e.target.value)} />
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{message.length} characters</div>
              </div>
              {sendChannel === "WhatsApp" && (
                <div style={{ marginBottom: 18, padding: "12px 14px", background: customer.whatsappOptIn ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${customer.whatsappOptIn ? "#A7F3D0" : "#FECACA"}`, borderRadius: 10 }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: "#334155", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={whatsappConsentConfirmed}
                      disabled={!customer.whatsappOptIn}
                      onChange={(e) => setWhatsappConsentConfirmed(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      I confirm this customer has explicitly opted in to receive WhatsApp messages from this business, and that the message category is covered by that consent.
                    </span>
                  </label>
                  {!customer.whatsappOptIn && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#B91C1C" }}>Record the customer's WhatsApp opt-in on the profile before sending.</div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setSendModal(false)}>Cancel</button>
                <button
                  style={{
                    flex: 1, padding: "9px 14px", borderRadius: 8, border: "none",
                    background: sendChannel === "WhatsApp" ? "linear-gradient(135deg,#25D366,#128C7E)" : "var(--primary)",
                    color: "#fff", fontSize: 14, fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    cursor: "pointer", boxShadow: sendChannel === "WhatsApp" ? "0 4px 12px rgba(37,211,102,0.35)" : undefined
                  }}
                  onClick={async () => {
                    if (sendChannel === "WhatsApp") {
                      try {
                        if (!customer.whatsappOptIn || !whatsappConsentConfirmed) {
                          setPopupData({ isOpen: true, title: "WhatsApp consent required", message: "Record explicit WhatsApp opt-in and confirm it before sending.", type: "warning" });
                          return;
                        }
                        const bridge = await getBridgeStatus();
                        if (bridge.online && bridge.isReady) {
                          const res = await sendSingleViaBridge(customer.phone, message, customer.name, true);
                          if (res.success) {
                            logCustomerMessage(customer.id, message, sendChannel);
                            setPopupData({ isOpen: true, title: "Message Submitted", message: `The message was submitted to WhatsApp for ${customer.name}. Delivery/read status is not guaranteed by the bridge.`, type: "success" });
                            setSendModal(false);
                            return;
                          }
                        }
                      } catch (e) {
                        // ignore and fallback
                      }
                      const cleaned = customer.phone.replace(/\s+/g, "").replace("+", "");
                      const text = encodeURIComponent(message);
                      window.open(`https://wa.me/${cleaned}?text=${text}`, "_blank");
                    } else if (sendChannel === "SMS") {
                      window.open(`sms:${customer.phone}?body=${encodeURIComponent(message)}`, "_blank");
                    } else {
                      window.open(`mailto:${customer.email}?subject=Glam Studio - Special Offer&body=${encodeURIComponent(message)}`, "_blank");
                    }
                    logCustomerMessage(customer.id, message, sendChannel);
                    setSendModal(false);
                  }}
                >
                  {sendChannel === "WhatsApp" ? "📱 Send via WhatsApp" : sendChannel === "SMS" ? "💬 Send SMS" : "✉ Send Email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Book Appointment Modal */}
      {bookModal && (
        <div className="modal-overlay" onClick={() => !bookSuccess && setBookModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Book Appointment</h3>
              {!bookSuccess && (
                <button onClick={() => setBookModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--muted-foreground)", lineHeight: 1 }}>×</button>
              )}
            </div>
            <div className="modal-body">
              {bookSuccess ? (
                <div style={{ textAlign: "center", padding: "28px 0" }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
                  <h4 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#15803D", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Appointment Booked!</h4>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--muted-foreground)" }}>
                    {bookForm.service} with {bookForm.staff} on {bookForm.date} at {bookForm.time}
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Customer</label>
                    <div style={{ padding: "9px 14px", background: "#F8FAFC", borderRadius: 8, fontSize: 14, border: "1px solid var(--border)", fontWeight: 600 }}>
                      {customer.name} · {customer.phone}
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Service</label>
                    <select
                      className="input"
                      value={bookForm.service}
                      onChange={e => setBookForm(p => ({ ...p, service: e.target.value }))}
                    >
                      {SERVICES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Date</label>
                      <input
                        type="date"
                        className="input"
                        value={bookForm.date}
                        onChange={e => setBookForm(p => ({ ...p, date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Time</label>
                      <select
                        className="input"
                        value={bookForm.time}
                        onChange={e => setBookForm(p => ({ ...p, time: e.target.value }))}
                      >
                        {["09:00 AM", "10:00 AM", "11:30 AM", "01:00 PM", "02:30 PM", "04:00 PM", "05:30 PM", "07:00 PM"].map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Stylist / Staff</label>
                    <select
                      className="input"
                      value={bookForm.staff}
                      onChange={e => setBookForm(p => ({ ...p, staff: e.target.value }))}
                    >
                      {STAFF.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setBookModal(false)}>Cancel</button>
                    <button
                      className="btn-primary"
                      style={{ flex: 1 }}
                      onClick={handleBooking}
                    >
                      Confirm Appointment
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    
      <PopupCard isOpen={popupData.isOpen} onClose={() => setPopupData(prev => ({ ...prev, isOpen: false }))} title={popupData.title} message={popupData.message} type={popupData.type} />
</div>
  );
}
