import React, { createContext, useContext, useEffect, useState } from "react";
import { getPublicShop, ShopRuntime } from "../services/shopApi";

interface RuntimeContextValue {
  runtime: ShopRuntime | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const ShopRuntimeContext = createContext<RuntimeContextValue | null>(null);

export function ShopRuntimeProvider({
  shopId,
  accessToken,
  children,
}: {
  shopId: string;
  accessToken: string;
  children: React.ReactNode;
}) {
  const [runtime, setRuntime] = useState<ShopRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const shop = await getPublicShop(shopId);
      setRuntime({ mode: "cloud", shopId, accessToken, shop });
    } catch (e: any) {
      setRuntime(null);
      setError(e?.message || "Unable to load shop.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [shopId, accessToken]);

  return <ShopRuntimeContext.Provider value={{ runtime, loading, error, refresh }}>{children}</ShopRuntimeContext.Provider>;
}

export function useShopRuntime() {
  const value = useContext(ShopRuntimeContext);
  if (!value) throw new Error("useShopRuntime must be used inside ShopRuntimeProvider");
  return value;
}
