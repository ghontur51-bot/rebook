import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { sendSingleViaBridge } from "../services/whatsappBridgeService";
import { PopupCard } from "../components/ModalCard";

export default function Staff() {
  const { staff, addStaff, updateStaff, deleteStaff, bookings } = useApp();
  const [newAssistant, setNewAssistant] = useState({ name: "", phone: "", template: "", active: true });
  const [popupData, setPopupData] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "success" | "error" | "info" | "warning";
    details?: string[];
  }>({ isOpen: false, title: "", message: "", type: "success" });

  const getLocalDateString = (dateObj: Date): string => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateString(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const assistantWork = useMemo(() => {
    return staff.map(a => ({
      ...a,
      work: bookings.filter(b => {
        if (b.date !== selectedDate) return false;
        if (b.bookingType === "walk-in") return false;
        if (b.staffId !== undefined && b.staffId !== null) {
          return String(b.staffId) === String(a.id);
        }
        return String(b.staff || "").trim().toLowerCase() === String(a.name || "").trim().toLowerCase();
      })
    }));
  }, [staff, bookings, selectedDate]);

  return (
    <div style={{ padding: "32px", maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", margin: 0 }}>Staff</h1>
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>Manage shop staff and their messaging templates</div>
      </div>

      <div className="stat-card" style={{ marginBottom: 20, padding: "24px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 20 }}>👤 Shop Assistants</div>
        
        {staff.map((a: any) => (
          <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 10, marginBottom: 10 }}>
            <input className="input" value={a.name} onChange={e => updateStaff(a.id, { name: e.target.value })} />
            <input className="input" value={a.phone} onChange={e => updateStaff(a.id, { phone: e.target.value })} />
            <input className="input" value={a.template} onChange={e => updateStaff(a.id, { template: e.target.value })} />
            <button className="btn-secondary" onClick={() => deleteStaff(a.id)}>Delete</button>
          </div>
        ))}
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 10, marginTop: 15, borderTop: "1px solid var(--border)", paddingTop: 15 }}>
          <input className="input" placeholder="Name" value={newAssistant.name} onChange={e => setNewAssistant(p => ({ ...p, name: e.target.value }))} />
          <input className="input" placeholder="WhatsApp Phone" value={newAssistant.phone} onChange={e => setNewAssistant(p => ({ ...p, phone: e.target.value }))} />
          <input className="input" placeholder="Template" value={newAssistant.template} onChange={e => setNewAssistant(p => ({ ...p, template: e.target.value }))} />
           <button className="btn-primary" onClick={() => { if(newAssistant.name) { addStaff(newAssistant as any); setNewAssistant({ name: "", phone: "", template: "", active: true }); } }}>Add</button>

        </div>
      </div>

      {/* Shop Assistant Work */}
      <div className="stat-card" style={{ marginBottom: 20, padding: "24px" }}>
        <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 20 }}>🗓️ Shop Assistant Work</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <input className="input" type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          <button className="btn-secondary" onClick={() => setSelectedDate(todayStr)}>Today</button>
          <button className="btn-secondary" onClick={() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            setSelectedDate(getLocalDateString(tomorrow));
          }}>Tomorrow</button>
          <button 
            className="btn-primary" 
            onClick={async () => {
              for (const aw of assistantWork) {
                if (aw.work.length > 0) {
                  const formattedDate = new Date(selectedDate).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
                  const workText = aw.work.map(w => `${w.time}: ${w.customer} - ${w.service} (₹${w.amount})`).join("\n");
                  const message = aw.template
                    .replace("{assistant}", aw.name)
                    .replace("{date}", formattedDate)
                    .replace("{count}", aw.work.length.toString())
                    .replace("{work}", workText);
                  await sendSingleViaBridge(aw.phone, message, aw.name);
                }
              }
              setPopupData({ isOpen: true, title: "Batch Send", message: "Work sent to all assistants with bookings.", type: "success" });
            }}
          >
            Send Work to All
          </button>
        </div>
        {assistantWork.map((aw: any) => {
          const formattedDate = new Date(selectedDate).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
          const workText = aw.work.map((w: any) => `${w.time}: ${w.customer} - ${w.service} (₹${w.amount})`).join("\n");
          
          const message = aw.template
            .replace("{assistant}", aw.name)
            .replace("{date}", formattedDate)
            .replace("{count}", aw.work.length.toString())
            .replace("{work}", workText || "No bookings");

          return (
            <div key={aw.id} style={{ marginBottom: 15, paddingBottom: 10, borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 5 }}>{aw.name} ({aw.work.length} bookings)</div>
              {aw.work.map((w: any) => <div key={w.id} style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{w.time} - {w.customer} - {w.service}</div>)}
            <div style={{ marginTop: 8, fontSize: 12, background: "#F1F5F9", padding: 8, borderRadius: 6, whiteSpace: "pre-wrap" }}>
              <strong>Preview:</strong><br />
              {message}
            </div>
            <button 
              className="btn-primary" 
              style={{ marginTop: 8, fontSize: 12, padding: "5px 10px" }}
              onClick={async () => {
                if (aw.work.length === 0) {
                  setPopupData({ isOpen: true, title: "Cannot Send", message: "Cannot send an empty work report.", type: "warning" });
                  return;
                }
                const res = await sendSingleViaBridge(aw.phone, message, aw.name);
                if (res.success) {
                  setPopupData({ isOpen: true, title: "Message Sent", message: `Message sent to ${aw.name}`, type: "success" });
                } else {
                  setPopupData({ isOpen: true, title: "Error", message: res.error || "Failed to send message", type: "error" });
                }
              }}
            >
              Send Message
            </button>
          </div>
          );
        })}
      </div>
      
      <PopupCard
        isOpen={popupData.isOpen}
        onClose={() => setPopupData(prev => ({ ...prev, isOpen: false }))}
        title={popupData.title}
        message={popupData.message}
        type={popupData.type}
        details={popupData.details}
      />
    </div>
  );
}

