import { Page } from "../App";
import { useApp } from "../context/AppContext";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "customers", label: "Customers", icon: "👥" },
  { id: "automations", label: "Automations", icon: "⚡" },
  { id: "campaigns", label: "Campaigns", icon: "📣" },
  { id: "bookings", label: "Bookings", icon: "📅" },
  { id: "staff", label: "Staff", icon: "👤" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙" },
];


interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: string) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { salon } = useApp();
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: 36, height: 36, background: "var(--primary)", borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0
          }}>✂</div>
          <div className="sidebar-logo-text">
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: "#F8FAFC", letterSpacing: "-0.02em" }}>ReBook</div>
            <div style={{ fontSize: 11, color: "#64748B", fontWeight: 400, marginTop: -2 }}>{salon.name}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 0" }}>
        <div style={{ padding: "6px 16px 8px", fontSize: 10, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }} className="sidebar-label">
          Main Menu
        </div>
        {navItems.map(item => (
          <div
            key={item.id}
            className={`sidebar-nav-item ${currentPage === item.id || (currentPage === "customer-profile" && item.id === "customers") ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px", borderRadius: 8, cursor: "pointer" }}
          className="sidebar-nav-item" onClick={() => onNavigate("settings")}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #0D9488, #0F766E)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 700, flexShrink: 0
          }}>GS</div>
          <div className="sidebar-label" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#E2E8F0", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{salon.name}</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>Pro Plan</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
