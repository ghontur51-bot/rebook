import { useApp, isRepeatCustomer } from "../context/AppContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, PieChart, Pie, Cell
} from "recharts";

export default function Analytics() {
  const { customers, bookings, automations, totalRecoveredRevenue, monthlyRevenueData } = useApp();
  const pieData = [
    { name: "Active", value: customers.filter(c => c.status === "active").length, color: "#10B981" },
    { name: "Inactive", value: customers.filter(c => c.status === "inactive").length, color: "#F59E0B" },
    { name: "Won Back", value: customers.filter(c => c.status === "won_back").length, color: "#3B82F6" },
  ];
  const contacted = automations.reduce((sum, auto) => sum + (auto.triggered || 0), 0);
  const returned = automations.reduce((sum, auto) => sum + (auto.converted || 0), 0);
  const roi = totalRecoveredRevenue / 1499;
  const conversionRate = contacted > 0 ? ((returned / contacted) * 100).toFixed(1) : "0.0";

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em", margin: 0 }}>Analytics</h1>
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>Last 6 months · Win-back performance overview</div>
      </div>

      {/* Top Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Automation Runs", value: contacted.toLocaleString(), sub: "Successful/recorded triggers", icon: "📤", color: "#3B82F6" },
          { label: "Conversions", value: returned.toLocaleString(), sub: `${conversionRate}% automation conversion rate`, icon: "🎯", color: "#10B981" },
          { label: "Revenue Recovered", value: `₹${totalRecoveredRevenue.toLocaleString()}`, sub: returned ? `₹${Math.round(totalRecoveredRevenue / returned).toLocaleString()} avg per return` : "No returns yet", icon: "💰", color: "#8B5CF6" },
          { label: "ROI", value: `${roi.toFixed(1)}×`, sub: "vs subscription cost", icon: "📈", color: "#F59E0B" },
          { label: "Repeat Customers", value: customers.filter(c => isRepeatCustomer(c, bookings)).length.toLocaleString(), sub: `${customers.length > 0 ? ((customers.filter(c => isRepeatCustomer(c, bookings)).length / customers.length) * 100).toFixed(1) : "0.0"}% of saved customers`, icon: "🔁", color: "#6366F1" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{s.icon}</div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: s.color, marginTop: 2, fontWeight: 500 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Contacts vs Returns */}
        <div className="stat-card" style={{ padding: "24px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 4 }}>Contacted vs Returned</div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>Monthly performance</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyRevenueData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="contacted" name="Contacted" fill="#DBEAFE" radius={[4, 4, 0, 0]} />
              <Bar dataKey="returned" name="Returned" fill="#0D9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue */}
        <div className="stat-card" style={{ padding: "24px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 4 }}>Revenue Recovered</div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>Monthly from win-back automations</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyRevenueData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v/1000}k`} />
              <Tooltip formatter={(v: any) => [`₹${v.toLocaleString()}`, "Revenue"]} contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13 }} />
              <Line type="monotone" dataKey="revenue" stroke="#0D9488" strokeWidth={2.5} dot={{ fill: "#0D9488", r: 5, strokeWidth: 0 }} activeDot={{ r: 7, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Automation Performance */}
        <div className="stat-card" style={{ padding: "24px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 4 }}>Automation Performance</div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>Exact live conversion rate: attributed bookings within 7 days ÷ successful automation runs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[...automations].sort((a, b) => b.conversionRate - a.conversionRate).map(auto => (
              <div key={auto.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 500 }}>{auto.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--foreground)" }}>
                    {auto.conversionRate}%
                  </span>
                </div>
                <div className="progress-bar" style={{ height: 8 }}>
                  <div className="progress-fill" style={{
                    width: `${Math.min(100, auto.conversionRate)}%`, height: "100%",
                    background: "var(--primary)"
                  }} />
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
                  <span>{auto.triggered} triggered</span>
                  <span>{auto.converted} converted</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Customer Status Pie */}
        <div className="stat-card" style={{ padding: "24px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 4 }}>Customer Status</div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12 }}>Current distribution</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={3} dataKey="value">
                {pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v: any, name: any) => [v, name]} contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, flex: 1 }}>{d.name}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13 }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
