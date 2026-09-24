import { useState } from "react";
import { useApp } from "../context/AppContext";

const triggerOptions = [
  "No visit for 30 days", "No visit for 60 days", "No visit for 90 days",
  "7 days before birthday", "1 day after visit", "After spending ₹5,000+"
];
const actionOptions = ["Send WhatsApp message", "Send SMS", "Send Email"];

function AutomationCard({ auto, onToggle, onEdit }: any) {
  return (
    <div className="automation-card" style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Flow indicator */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0, paddingTop: 2 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: auto.status === "active" ? "#E0FDF4" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
            {auto.status === "active" ? "⚡" : "⏸"}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{auto.name}</div>
            <label className="toggle">
              <input type="checkbox" checked={auto.status === "active"} onChange={() => onToggle(auto.id)} />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Rule flow */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ padding: "5px 10px", background: "#FEF3C7", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#D97706" }}>
              IF: {auto.trigger}
            </div>
            <span style={{ color: "var(--muted-foreground)", fontSize: 16 }}>→</span>
            <div style={{ padding: "5px 10px", background: "#DCFCE7", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#15803D" }}>
              THEN: {auto.action}
            </div>
          </div>

          {/* Message preview */}
          <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6, marginBottom: 14, borderLeft: "3px solid var(--border)" }}>
            "{auto.message.substring(0, 120)}{auto.message.length > 120 ? "..." : ""}"
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 24 }}>
            {[
              { label: "Triggered", value: auto.triggered },
              { label: "Converted", value: auto.converted },
              { label: "Conversion Rate", value: `${auto.conversionRate}%`, highlight: true },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: s.highlight ? "var(--primary)" : "var(--foreground)" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
            <div style={{ marginLeft: "auto" }}>
              <button className="btn-secondary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => onEdit(auto)}>Edit Rule</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Automations() {
  const { automations, toggleAutomation, saveAutomation } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingAuto, setEditingAuto] = useState<any>(null);
  const [form, setForm] = useState({ name: "", trigger: triggerOptions[1], action: actionOptions[0], message: "" });

  const onToggle = (id: number) => {
    toggleAutomation(id);
  };

  const openNew = () => {
    setEditingAuto(null);
    setForm({ name: "", trigger: triggerOptions[1], action: actionOptions[0], message: "" });
    setShowModal(true);
  };

  const openEdit = (auto: any) => {
    setEditingAuto(auto);
    setForm({ name: auto.name, trigger: auto.trigger, action: auto.action, message: auto.message });
    setShowModal(true);
  };

  const saveAuto = () => {
    saveAutomation(editingAuto ? { ...form, id: editingAuto.id } : form);
    setShowModal(false);
    setEditingAuto(null);
    setForm({ name: "", trigger: triggerOptions[1], action: actionOptions[0], message: "" });
  };

  const activeCount = automations.filter(a => a.status === "active").length;

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em", margin: 0 }}>Automations</h1>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>{activeCount} active · Set it once, let ReBook do the rest</div>
        </div>
        <button className="btn-primary" onClick={openNew}>+ New Automation</button>
      </div>

      {/* Summary bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Triggered", value: automations.reduce((s, a) => s + a.triggered, 0), icon: "⚡", color: "#F59E0B" },
          { label: "Total Converted", value: automations.reduce((s, a) => s + a.converted, 0), icon: "🎯", color: "#10B981" },
          { label: "Avg Conversion Rate", value: `${(automations.reduce((s, a) => s + a.conversionRate, 0) / automations.length).toFixed(1)}%`, icon: "📈", color: "#8B5CF6" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ background: "linear-gradient(135deg, #F0FDF4, #E0FDF4)", border: "1px solid #A7F3D0", borderRadius: "var(--radius)", padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🤖</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#065F46" }}>How Automations Work</div>
          <div style={{ fontSize: 13, color: "#047857" }}>ReBook watches your customer visit data 24/7. When a rule is triggered, it automatically sends the right message at the right time — no manual work needed.</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {automations.map(auto => (
          <AutomationCard key={auto.id} auto={auto} onToggle={onToggle} onEdit={openEdit} />
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {editingAuto ? "Edit Automation" : "Create Automation"}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--muted-foreground)", lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Automation Name</label>
                <input className="input" placeholder="e.g. 60-Day Win-Back" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>

              {/* Visual Builder */}
              <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "16px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Rule Builder</div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ padding: "6px 10px", background: "#FEF3C7", borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#D97706", flexShrink: 0 }}>IF</div>
                  <select className="input" value={form.trigger} onChange={e => setForm(p => ({ ...p, trigger: e.target.value }))}>
                    {triggerOptions.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                <div style={{ borderLeft: "2px dashed #CBD5E1", marginLeft: 20, paddingLeft: 20, paddingTop: 4, paddingBottom: 4, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>↳ automatically triggers…</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ padding: "6px 10px", background: "#DCFCE7", borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#15803D", flexShrink: 0 }}>THEN</div>
                  <select className="input" value={form.action} onChange={e => setForm(p => ({ ...p, action: e.target.value }))}>
                    {actionOptions.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Message Template</label>
                <textarea className="input" style={{ minHeight: 120, resize: "vertical", lineHeight: 1.6 }}
                  placeholder="Use {name} to personalize. E.g. Hi {name}! We miss you..."
                  value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} />
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>Tip: Use {"{name}"} for the customer's first name</div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={saveAuto}>
                  {editingAuto ? "Save Changes" : "Create Automation ⚡"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
