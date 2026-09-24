import { useState, useRef } from "react";
import { Page } from "../App";
import { useApp, isRepeatCustomer } from "../context/AppContext";

const TODAY = new Date();
const statusOptions = ["all", "active", "inactive", "won_back", "repeat"];
const statusLabel: Record<string, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
  won_back: "Won Back",
  repeat: "Repeat",
};

const serviceOptions = [
  "Hair Colour & Highlights",
  "Keratin Treatment",
  "Facial & Cleanup",
  "Manicure & Pedicure",
  "Blow Dry & Styling",
  "Hair Spa",
  "Bridal Package",
  "Threading & Waxing",
  "Balayage",
  "Nail Art",
  "Basic Facial",
];

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <span className="badge badge-green">Active</span>;
  if (status === "inactive") return <span className="badge badge-amber">Inactive</span>;
  if (status === "won_back") return <span className="badge badge-blue">Won Back</span>;
  return null;
}

export default function Customers({
  onNavigate,
  customers,
  onAddCustomer,
}: {
  onNavigate: (p: Page, id?: number) => void;
  customers: any[];
  onAddCustomer: (c: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("lastVisit");
  const [showAddModal, setShowAddModal] = useState(false);
  const [csvToast, setCsvToast] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    phone: "",
    email: "",
    favouriteService: serviceOptions[0],
  });
  const [addSuccess, setAddSuccess] = useState(false);
  const [addError, setAddError] = useState("");
  const { bookings, importCustomers } = useApp();

  const filtered = customers
    .filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        c.email.toLowerCase().includes(search.toLowerCase());
      const matchStatus = status === "all" || (status === "repeat" ? isRepeatCustomer(c, bookings) : c.status === status);
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sort === "lastVisit")
        return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
      if (sort === "totalSpend") return b.totalSpend - a.totalSpend;
      if (sort === "totalVisits") return b.totalVisits - a.totalVisits;
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });

  const daysSince = (date: string) =>
    Math.floor((TODAY.getTime() - new Date(date).getTime()) / 86400000);

  const handleAddCustomer = () => {
    setAddError("");
    if (!addForm.name.trim()) {
      setAddError("Customer name is required.");
      return;
    }
    if (!/^\+?\d[\d\s-]{9,}$/.test(addForm.phone.trim()) || addForm.phone.replace(/\D/g, "").length !== 10) {
      setAddError("A valid 10-digit phone number is required for exact customer identity and repeat tracking.");
      return;
    }
    const initials = addForm.name
      .trim()
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    const todayStr = TODAY.toISOString().split("T")[0];
    onAddCustomer({
      name: addForm.name.trim(),
      phone: addForm.phone.trim(),
      email: addForm.email || "",
      status: "active",
      lastVisit: todayStr,
      totalVisits: 0,
      totalSpend: 0,
      favouriteService: addForm.favouriteService,
      tags: ["New"],
      notes: "",
      avatar: initials,
    });
    setAddSuccess(true);
    setTimeout(() => {
      setAddSuccess(false);
      setShowAddModal(false);
      setAddError("");
      setAddForm({ name: "", phone: "", email: "", favouriteService: serviceOptions[0] });
    }, 1200);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string>("");

  const handleImportCSV = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          setImportMessage("CSV file must contain at least a header and one row.");
          setCsvToast(true);
          setTimeout(() => setCsvToast(false), 3000);
          return;
        }

        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const nameIdx = headers.findIndex((h) => h.includes("name"));
        const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("mobile"));
        const emailIdx = headers.findIndex((h) => h.includes("email"));
        const serviceIdx = headers.findIndex((h) => h.includes("service"));
        const spendIdx = headers.findIndex((h) => h.includes("spend") || h.includes("amount"));
        const visitsIdx = headers.findIndex((h) => h.includes("visit"));

        const newCustomers: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
          const name = parts[nameIdx >= 0 ? nameIdx : 0];
          if (!name) continue;

          newCustomers.push({
            name,
            phone: parts[phoneIdx >= 0 ? phoneIdx : 1] || "",
            email: parts[emailIdx >= 0 ? emailIdx : 2] || "",
            favouriteService: parts[serviceIdx >= 0 ? serviceIdx : 3] || "Basic Facial",
            totalSpend: Number(parts[spendIdx >= 0 ? spendIdx : 4]) || 0,
            totalVisits: Number(parts[visitsIdx >= 0 ? visitsIdx : 5]) || 1,
            status: "active",
            tags: ["Imported"],
          });
        }

        if (newCustomers.length > 0) {
          const count = importCustomers(newCustomers);
          setImportMessage(`Successfully imported ${count} customers from CSV!`);
        } else {
          setImportMessage("No valid customer records found in CSV.");
        }
      } catch (err: any) {
        setImportMessage("Error reading CSV file: " + err.message);
      }
      setCsvToast(true);
      setTimeout(() => setCsvToast(false), 3500);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: "32px" }}>
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv,text/csv"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* CSV Toast */}
      {csvToast && (
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            background: "#0F172A",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 200,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>📁</span> {importMessage || "CSV processed successfully!"}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Customers
          </h1>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
            {customers.length} total · {customers.filter((c) => c.status === "inactive").length} inactive
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-secondary" style={{ fontSize: 13 }} onClick={handleImportCSV}>
            ⬆ Import CSV
          </button>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setShowAddModal(true)}>
            + Add Customer
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 380 }}>
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted-foreground)",
              fontSize: 15,
            }}
          >
            🔍
          </span>
          <input
            className="input"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 38 }}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {statusOptions.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: status === s ? "var(--primary)" : "var(--border)",
                background: status === s ? "var(--primary)" : "#fff",
                color: status === s ? "#fff" : "var(--foreground)",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 500,
                transition: "all 0.15s",
              }}
            >
              {statusLabel[s]}
            </button>
          ))}
        </div>
        <select
          className="input"
          style={{ width: "auto", flexShrink: 0 }}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="lastVisit">Sort: Last Visit</option>
          <option value="totalSpend">Sort: Total Spend</option>
          <option value="totalVisits">Sort: Total Visits</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Status</th>
              <th>Last Visit</th>
              <th>Total Visits</th>
              <th>Total Spend</th>
              <th>Favourite Service</th>
              <th>Tags</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                style={{ cursor: "pointer" }}
                onClick={() => onNavigate("customer-profile", c.id)}
              >
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        flexShrink: 0,
                        background:
                          c.status === "active"
                            ? "#DCFCE7"
                            : c.status === "won_back"
                            ? "#DBEAFE"
                            : "#FEF3C7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color:
                          c.status === "active"
                            ? "#15803D"
                            : c.status === "won_back"
                            ? "#1D4ED8"
                            : "#D97706",
                      }}
                    >
                      {c.avatar}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{c.phone}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <StatusBadge status={c.status} />
                    <span className={`badge ${isRepeatCustomer(c, bookings) ? "badge-blue" : "badge-gray"}`}>
                      {isRepeatCustomer(c, bookings) ? "Repeat" : "New"}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 14 }}>
                    {new Date(c.lastVisit).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: c.status === "inactive" ? "#D97706" : "var(--muted-foreground)",
                    }}
                  >
                    {daysSince(c.lastVisit)} days ago
                  </div>
                </td>
                <td>
                  <span className="font-mono-data" style={{ fontSize: 14 }}>
                    {c.totalVisits}
                  </span>
                </td>
                <td>
                  <span className="font-mono-data" style={{ fontSize: 14, fontWeight: 600 }}>
                    ₹{c.totalSpend.toLocaleString()}
                  </span>
                </td>
                <td style={{ maxWidth: 180 }}>
                  <div
                    style={{
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.favouriteService}
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {c.tags.filter((t: string) => !["new", "repeat"].includes(t.trim().toLowerCase())).slice(0, 2).map((t: string) => (
                      <span key={t} className="badge badge-gray" style={{ fontSize: 11 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: "5px 12px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate("customer-profile", c.id);
                    }}
                  >
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--muted-foreground)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>No customers found</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filters</div>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Add Customer
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 22,
                  color: "var(--muted-foreground)",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {[
                { label: "Full Name *", key: "name", placeholder: "e.g. Priya Sharma" },
                { label: "Phone *", key: "phone", placeholder: "e.g. +91 98201 45678" },
                { label: "Email", key: "email", placeholder: "e.g. priya@gmail.com" },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label
                    style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}
                  >
                    {f.label}
                  </label>
                  <input
                    className="input"
                    placeholder={f.placeholder}
                    value={(addForm as any)[f.key]}
                    onChange={(e) =>
                      setAddForm((p) => ({ ...p, [f.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}
                >
                  Favourite Service
                </label>
                <select
                  className="input"
                  value={addForm.favouriteService}
                  onChange={(e) => setAddForm((p) => ({ ...p, favouriteService: e.target.value }))}
                >
                  {serviceOptions.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              {addError && (
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, lineHeight: 1.45 }}>
                  {addError}
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  style={{ flex: 1, background: addSuccess ? "#10B981" : undefined }}
                  onClick={handleAddCustomer}
                >
                  {addSuccess ? "✓ Added!" : "Add Customer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
