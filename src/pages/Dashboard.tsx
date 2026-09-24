import { useState } from "react";
import { Page } from "../App";
import { useApp, isRepeatCustomer, getCustomerLifecycle, normalizePhone, isBookingForCustomer } from "../context/AppContext";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const TODAY = new Date();

function StatCard({ label, value, sub, icon, color, onClick }: any) {
  return (
    <div className="stat-card" style={{ cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500, marginBottom: 8 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: "var(--foreground)",
              letterSpacing: "-0.02em",
            }}
          >
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{sub}</div>
          )}
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: color + "18",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({
  onNavigate,
  customers: propCustomers,
}: {
  onNavigate: (p: Page, id?: number) => void;
  customers?: any[];
}) {
  const [period, setPeriod] = useState("6m");
  const {
    customers: contextCustomers,
    bookings,
    visitHistory,
    totalRecoveredRevenue,
    monthlyRevenueData,
    automations,
    customerMessages,
    salon,
  } = useApp();

  const customers = propCustomers || contextCustomers;

  // Dynamic greeting based on real time
  const hour = TODAY.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = TODAY.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Live stats from lifted customer state
  const totalCustomers = customers.length;
  const inactiveCustomers = customers.filter((c) => c.status === "inactive").length;
  const wonBack = customers.filter((c) => c.status === "won_back").length;
  const repeatCustomers = customers.filter((c) => isRepeatCustomer(c, bookings)).length;
  const repeatRate = totalCustomers > 0
    ? Math.round((repeatCustomers / totalCustomers) * 100)
    : 0;

  // Calculate repeat-rate change from actual booking/customer data
  const currentYear = TODAY.getFullYear();
  const currentMonth = TODAY.getMonth();
  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth();

  const getPeriodRepeatRate = (year: number, month: number): number | null => {
    const isInPeriod = (dateStr?: string) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
    };

    const activeCustomersMap = new Map<string | number, boolean>();

    // 1. Confirmed or active bookings in the period
    (bookings || [])
      .filter((b) => isInPeriod(b.date) && b.status !== "cancelled")
      .forEach((b) => {
        const matched = customers.find((c) => isBookingForCustomer(b, c));
        const id = matched ? matched.id : (normalizePhone(b.customerPhone) || `booking:${b.id}`);
        const isRepeat = matched ? isRepeatCustomer(matched, bookings) : false;
        activeCustomersMap.set(id, isRepeat);
      });

    // 2. Visits in visitHistory within the period
    if (visitHistory) {
      Object.entries(visitHistory).forEach(([idStr, visits]) => {
        const id = Number(idStr);
        if (Array.isArray(visits) && visits.some((v) => isInPeriod(v.date))) {
          const matched = customers.find((c) => c.id === id);
          const isRepeat = matched ? isRepeatCustomer(matched, bookings) : visits.length > 1;
          activeCustomersMap.set(id, isRepeat);
        }
      });
    }

    // 3. Customers whose lastVisit falls in the period
    customers
      .filter((c) => isInPeriod(c.lastVisit))
      .forEach((c) => {
        activeCustomersMap.set(c.id, isRepeatCustomer(c, bookings));
      });

    if (activeCustomersMap.size === 0) return null;

    let repeatCount = 0;
    activeCustomersMap.forEach((isRepeat) => {
      if (isRepeat) repeatCount++;
    });

    return Math.round((repeatCount / activeCustomersMap.size) * 100);
  };

  const currentPeriodRepeatRate = getPeriodRepeatRate(currentYear, currentMonth);
  const previousPeriodRepeatRate = getPeriodRepeatRate(prevYear, prevMonth);

  const displayRepeatRate = currentPeriodRepeatRate !== null ? currentPeriodRepeatRate : repeatRate;
  const currentForComparison = currentPeriodRepeatRate !== null ? currentPeriodRepeatRate : repeatRate;

  let repeatRateChangeSub = "0% vs last month";
  if (previousPeriodRepeatRate !== null) {
    const diff = currentForComparison - previousPeriodRepeatRate;
    if (diff > 0) {
      repeatRateChangeSub = `↑ ${diff}% vs last month`;
    } else if (diff < 0) {
      repeatRateChangeSub = `↓ ${Math.abs(diff)}% vs last month`;
    } else {
      repeatRateChangeSub = "0% vs last month";
    }
  } else {
    // If insufficient historical data for previous period, use safe neutral fallback
    repeatRateChangeSub = "0% vs last month";
  };

  const recentInactive = customers.filter((c) => c.status === "inactive").slice(0, 4);
  const recentWonBack = customers.filter((c) => c.status === "won_back").slice(0, 3);

  // Period filter: "3m" = last 3 months of data, "6m"/"1y" = all available
  const chartData =
    period === "3m" ? monthlyRevenueData.slice(-3) : monthlyRevenueData;

  const activeAutomationsCount = automations.filter((a) => a.status === "active").length;
  const totalMessagesSent = 142 + customerMessages.length;

  return (
    <div style={{ padding: "32px 32px 40px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 28,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: "-0.02em",
              color: "var(--foreground)",
            }}
          >
            {greeting}, {salon.name} 👋
          </div>
          <div style={{ fontSize: 14, color: "var(--muted-foreground)", marginTop: 2 }}>
            {dateStr} · Here's what's happening today
          </div>
        </div>
        <button className="btn-primary" onClick={() => onNavigate("campaigns")}>
          + New Campaign
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
        <StatCard
          label="Total Customers"
          value={totalCustomers}
          sub={`${customers.filter(c => getCustomerLifecycle(c, bookings) === "New").length} currently new`}
          icon="👥"
          color="#0D9488"
          onClick={() => onNavigate("customers")}
        />
        <StatCard
          label="Inactive Customers"
          value={inactiveCustomers}
          sub="Need attention"
          icon="⏰"
          color="#F59E0B"
          onClick={() => onNavigate("customers")}
        />
        <StatCard label="Won Back" value={wonBack} sub="Last 90 days" icon="🎯" color="#10B981" />
        <StatCard
          label="Revenue Recovered"
          value={`₹${totalRecoveredRevenue.toLocaleString()}`}
          sub="Last 90 days"
          icon="💰"
          color="#8B5CF6"
        />
        <StatCard
          label="Repeat Rate"
          value={`${displayRepeatRate}%`}
          sub={repeatRateChangeSub}
          icon="🔄"
          color="#EC4899"
        />
      </div>

      {/* ROI Card + Chart Row */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, marginBottom: 20 }}>

        {/* ROI Card */}
        <div className="roi-card">
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>✨</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#5EEAD4",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Your ROI
              </span>
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                lineHeight: 1.2,
                marginBottom: 20,
              }}
            >
              ReBook pays for itself — automatically.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 13, color: "#94A3B8" }}>Subscription cost</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  ₹1,499/mo
                </span>
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 13, color: "#94A3B8" }}>Avg profit per return</span>
                <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  ₹500
                </span>
              </div>
              <div
                style={{
                  background: "rgba(13,148,136,0.25)",
                  border: "1px solid rgba(13,148,136,0.4)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 12, color: "#5EEAD4", marginBottom: 4 }}>Break-even point</div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    color: "#5EEAD4",
                  }}
                >
                  Only 3 customers
                </div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                  You already won back {wonBack} this month 🎉
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue Chart */}
        <div className="stat-card" style={{ padding: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Revenue Recovered
              </div>
              <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                From win-back automations
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["3m", "6m", "1y"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid",
                    borderColor: period === p ? "var(--primary)" : "var(--border)",
                    background: period === p ? "var(--primary)" : "transparent",
                    color: period === p ? "#fff" : "var(--muted-foreground)",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0D9488" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v: any) => [`₹${v.toLocaleString()}`, "Revenue"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13 }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#0D9488"
                strokeWidth={2.5}
                fill="url(#revGrad)"
                dot={{ fill: "#0D9488", r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Inactive Customers */}
        <div className="stat-card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "18px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Inactive Customers
            </div>
            <button
              className="btn-secondary"
              style={{ fontSize: 12, padding: "5px 12px" }}
              onClick={() => onNavigate("customers")}
            >
              View All →
            </button>
          </div>
          {recentInactive.map((c) => {
            const days = Math.floor(
              (TODAY.getTime() - new Date(c.lastVisit).getTime()) / 86400000
            );
            return (
              <div
                key={c.id}
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid #F8FAFC",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                }}
                onClick={() => onNavigate("customer-profile", c.id)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "#FEF3C7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#D97706",
                    flexShrink: 0,
                  }}
                >
                  {c.avatar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{c.favouriteService}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <span className="badge badge-amber">{days}d ago</span>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                    ₹{c.totalSpend.toLocaleString()} total
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Won Back */}
        <div className="stat-card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "18px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Recently Won Back 🎯
            </div>
            <button
              className="btn-secondary"
              style={{ fontSize: 12, padding: "5px 12px" }}
              onClick={() => onNavigate("analytics")}
            >
              See Stats →
            </button>
          </div>
          {recentWonBack.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid #F8FAFC",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
              }}
              onClick={() => onNavigate("customer-profile", c.id)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#DCFCE7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#15803D",
                  flexShrink: 0,
                }}
              >
                {c.avatar}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{c.favouriteService}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <span className="badge badge-green">✓ Returned</span>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                  ₹{c.totalSpend.toLocaleString()} total
                </div>
              </div>
            </div>
          ))}
          <div
            style={{
              padding: "16px 20px",
              background: "#F0FDF4",
              borderTop: "1px solid #DCFCE7",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontSize: 13, color: "#15803D", fontWeight: 500 }}>
              {activeAutomationsCount} automation{activeAutomationsCount === 1 ? "" : "s"} running right now · {totalMessagesSent} messages sent this month
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
