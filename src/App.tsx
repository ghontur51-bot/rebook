import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerProfile from "./pages/CustomerProfile";
import Automations from "./pages/Automations";
import Campaigns from "./pages/Campaigns";
import Bookings from "./pages/Bookings";
import Staff from "./pages/Staff";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import SuperAdmin from "./pages/SuperAdmin";
import Payment from "./pages/Payment";
import ShopFrozen from "./pages/ShopFrozen";
import { AppProvider, useApp } from "./context/AppContext";
import { ShopRuntimeProvider, useShopRuntime } from "./context/ShopRuntimeContext";

export type Page =
  | "dashboard"
  | "customers"
  | "customer-profile"
  | "automations"
  | "campaigns"
  | "bookings"
  | "staff"
  | "analytics"
  | "settings";

function AppContent() {
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const { customers, addCustomer } = useApp();

  const navigateTo = (p: Page, customerId?: number) => {
    setPage(p);
    if (customerId !== undefined) setSelectedCustomerId(customerId);
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--background)" }}>
      <Sidebar currentPage={page} onNavigate={(p) => navigateTo(p as Page)} />
      <main style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
        {page === "dashboard" && <Dashboard onNavigate={navigateTo} customers={customers} />}
        {page === "customers" && <Customers onNavigate={navigateTo} customers={customers} onAddCustomer={addCustomer} />}
        {page === "customer-profile" && selectedCustomer && <CustomerProfile key={selectedCustomer.id} customer={selectedCustomer} onBack={() => navigateTo("customers")} />}
        {page === "automations" && <Automations />}
        {page === "campaigns" && <Campaigns />}
        {page === "bookings" && <Bookings />}
        {page === "staff" && <Staff />}
        {page === "analytics" && <Analytics />}
        {page === "settings" && <Settings />}
      </main>
    </div>
  );
}

function CloudShopApp({ shopId, accessToken }: { shopId: string; accessToken: string }) {
  return (
    <ShopRuntimeProvider shopId={shopId} accessToken={accessToken}>
      <CloudShopGate />
    </ShopRuntimeProvider>
  );
}

function CloudShopGate() {
  const { runtime, loading, error, refresh } = useShopRuntime();

  if (loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--background)", color: "var(--muted-foreground)" }}>Loading ReBook…</div>;
  if (error || !runtime) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--background)", padding: 24 }}><div className="stat-card" style={{ maxWidth: 560, padding: 28 }}><div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Shop unavailable</div><div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>{error || "Invalid shop link."}</div></div></div>;
  }

  if (runtime.shop.status !== "active") {
    return <ShopFrozen shop={runtime.shop} onRefresh={() => void refresh()} />;
  }

  return <AppProvider runtime={runtime}><AppContent /></AppProvider>;
}

function RouteResolver() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "superadmin") return <SuperAdmin />;
  if (parts[0] === "pay" && parts[1] && parts[2]) return <Payment shopId={parts[1]} cycleId={parts[2]} />;
  if (parts[0] === "shop" && parts[1] && parts[2]) return <CloudShopApp shopId={parts[1]} accessToken={parts[2]} />;

  return <AppProvider><AppContent /></AppProvider>;
}

export default function App() {
  return <RouteResolver />;
}
