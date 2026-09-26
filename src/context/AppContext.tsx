import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { sendSingleViaBridge } from "../services/whatsappBridgeService";
import { getCloudState, syncCloudCollection, resetCloudData, type ShopRuntime } from "../services/shopApi";
import {
  customers as initialCustomers,
  visitHistory as initialVisitHistory,
  automations as initialAutomations,
  campaigns as initialCampaigns,
  bookings as initialBookings,
  analyticsData as initialAnalyticsData,
  staff as initialStaff,
} from "../data";


export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  status: "active" | "inactive" | "won_back" | string;
  lastVisit: string;
  totalVisits: number;
  totalSpend: number;
  favouriteService: string;
  tags: string[];
  notes: string;
  avatar: string;
  /** Explicit WhatsApp messaging consent. Never inferred from having a phone number. */
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string;
  whatsappOptInSource?: string;
  /** System-controlled lifecycle; tags are not used as the source of truth. */
  lifecycle?: "New" | "Repeat";
}

export interface VisitRecord {
  date: string;
  service: string;
  amount: number;
  staff: string;
}

export interface Booking {
  id: number;
  customer: string;
  customerId?: number;
  customerPhone?: string;
  service: string;
  date: string;
  time: string;
  staff: string;
  staffId?: number;
  amount: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  createdAt?: string;
  confirmedAt?: string;
  bookingType?: "walk-in" | "appointment";
}

/**
 * Normalizes phone numbers consistently for identity comparison.
 * Extracts digits and returns the last 10 digits (national format in IN).
 * Returns empty string if invalid or fewer than 10 digits.
 */
function sha256(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export function normalizePhone(phone: string | undefined | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Canonical customer lifecycle rule used everywhere in the app.
 *
 * A customer is Repeat when the app already knows that customer and a later
 * appointment or walk-in is recorded for the same normalized phone number.
 * A persisted Repeat tag and an explicit totalVisits >= 2 are also accepted
 * as existing, non-guess historical evidence for legacy/imported records.
 * Customer name is never used as an identity key.
 */
export function isRepeatCustomer(customer: Customer, allBookings: Booking[] = []): boolean {
  if (customer.lifecycle === "Repeat") return true;
  if (customer.lifecycle === "New") return false;
  // Legacy/imported records created before lifecycle tracking fall back only to
  // explicit visit history or exact phone-matched booking history.
  if ((Number(customer.totalVisits) || 0) >= 2) return true;

  const phone = normalizePhone(customer.phone);
  if (phone.length !== 10) return false;

  const matchingBookings = allBookings.filter((booking) =>
    booking.status !== "cancelled" && normalizePhone(booking.customerPhone) === phone
  );

  return matchingBookings.length >= 2;
}

export function getCustomerLifecycle(customer: Customer, allBookings: Booking[] = []): "New" | "Repeat" {
  return isRepeatCustomer(customer, allBookings) ? "Repeat" : "New";
}

/**
 * Formats a raw phone input into standard display format "+91 XXXXX XXXXX" if 10 digits.
 */
export function formatPhone(phone: string | undefined | null): string {
  const norm = normalizePhone(phone);
  if (norm.length === 10) {
    return `+91 ${norm.slice(0, 5)} ${norm.slice(5)}`;
  }
  return phone ? phone.trim() : "";
}

/**
 * Determines whether a booking belongs to a customer.
 * Uses normalized phone number as primary identity link.
 * Supports legacy customerId matching when customerPhone is absent on legacy records.
 * NEVER uses customer name as identity fallback.
 */
export function isBookingForCustomer(booking: Booking, customer: Customer): boolean {
  const bNormPhone = normalizePhone(booking.customerPhone);
  const cNormPhone = normalizePhone(customer.phone);

  if (bNormPhone && cNormPhone) {
    return bNormPhone === cNormPhone;
  }

  // Legacy fallback support for older records without customerPhone
  if (booking.customerId !== undefined && booking.customerId === customer.id) {
    return true;
  }

  return false;
}

export interface Automation {
  id: number;
  name: string;
  trigger: string;
  action: string;
  message: string;
  status: "active" | "inactive";
  triggered: number;
  converted: number;
  conversionRate: number;
  triggeredCustomerIds?: number[];
}

export interface Campaign {
  id: number;
  name: string;
  audience: string;
  sent: number;
  opened: number;
  converted: number;
  status: "completed" | "scheduled" | "draft" | "active";
  date: string;
  channel: string;
  message?: string;
}

export interface CustomerMessage {
  id: string;
  customerId: number;
  text: string;
  channel: "WhatsApp" | "SMS" | "Email" | string;
  date: string;
  opened?: boolean;
  campaignId?: number;
}

export interface ShopAssistant {
  id: number;
  name: string;
  phone: string;
  template: string;
  active: boolean;
  workingDays: string[];
  startTime: string;
  endTime: string;
}

export interface SalonSettings {

  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
}

export interface NotificationSettings {
  whatsapp: boolean;
  sms: boolean;
  email: boolean;
  dailySummary: boolean;
}

interface AppContextType {
  // Customers
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, "id"> & { id?: number }) => Customer;
  updateCustomer: (id: number, updates: Partial<Customer>) => void;
  importCustomers: (newCustomers: Array<Partial<Customer> & { name: string }>) => number;

  // Bookings
  bookings: Booking[];
  addBooking: (booking: Omit<Booking, "id"> & { id?: number }) => Booking;
  updateBookingStatus: (id: number, status: Booking["status"]) => void;

  // Visits & History
  visitHistory: Record<number, VisitRecord[]>;
  addVisitRecord: (customerId: number, record: VisitRecord) => void;

  // Messages
  customerMessages: CustomerMessage[];
  logCustomerMessage: (customerId: number, text: string, channel: string, campaignId?: number) => void;
  getCustomerMessages: (customerId: number) => CustomerMessage[];

  // Automations
  automations: Automation[];
  toggleAutomation: (id: number) => void;
  saveAutomation: (automation: Partial<Automation> & { name: string; trigger: string; action: string; message: string; id?: number }) => void;
  automationScheduler: AutomationSchedulerSettings;
  updateAutomationScheduler: (updates: Partial<AutomationSchedulerSettings>) => void;

  // Campaigns
  campaigns: Campaign[];
  addCampaign: (campaign: Omit<Campaign, "id">) => Campaign;
  recordBlastResults: (campaignId: number, sentCount: number, recipientIds: number[], channel?: string, messageText?: string) => void;

  // Settings
  salon: SalonSettings;
  updateSalon: (updates: Partial<SalonSettings>) => void;
  notifications: NotificationSettings;
  updateNotifications: (updates: Partial<NotificationSettings>) => void;
  staff: ShopAssistant[];
  addStaff: (assistant: Omit<ShopAssistant, "id">) => void;
  updateStaff: (id: number, assistant: Partial<ShopAssistant>) => void;
  deleteStaff: (id: number) => void;

  // Reset
  resetAppData: () => void;


  // Derived / Dynamic Stats
  totalRecoveredRevenue: number;
  monthlyRevenueData: Array<{ month: string; contacted: number; returned: number; revenue: number }>;
}

let automationCloudRuntime: ShopRuntime | null = null;

export function setAutomationCloudRuntime(runtime: ShopRuntime | null) {
  automationCloudRuntime = runtime;
}

const STORAGE_KEYS = {
  CUSTOMERS: "rebook_customers_v1",
  BOOKINGS: "rebook_bookings_v1",
  VISITS: "rebook_visits_v1",
  AUTOMATIONS: "rebook_automations_v1",
  CAMPAIGNS: "rebook_campaigns_v1",
  MESSAGES: "rebook_messages_v1",
  SALON: "rebook_salon_v1",
  NOTIFICATIONS: "rebook_notifications_v1",
  AUTOMATION_RUNS: "rebook_automation_runs_v1",
  STAFF: "rebook_staff_v1",
  AUTOMATION_SCHEDULER: "rebook_automation_scheduler_v1",
};


export interface AutomationRun {
  automationId: number;
  customerId: number;
  triggeredAt: string;
  status: "queued" | "sent" | "recorded" | "failed";
  dedupeKey: string;
  triggerBookingId?: number;
  convertedAt?: string;
  bookingId?: number;
}

// A conversion is attributed only to the latest successful automation run for that
// customer when the next confirmed/completed booking happens within this window.
export const AUTOMATION_CONVERSION_WINDOW_DAYS = 7;

export interface AutomationSchedulerSettings {
  enabled: boolean;
  runHour: number;
  timezone: string;
  lastRunDate: string | null;
  lastRunAt: string | null;
  lastRunStatus: "never" | "success" | "partial" | "failed";
  lastRunSummary: { eligible: number; queued: number; failed: number } | null;
}

export const DEFAULT_AUTOMATION_SCHEDULER: AutomationSchedulerSettings = {
  enabled: true,
  runHour: 23,
  timezone: "Asia/Kolkata",
  lastRunDate: null,
  lastRunAt: null,
  lastRunStatus: "never",
  lastRunSummary: null,
};

export function normalizeAutomationScheduler(value?: Partial<AutomationSchedulerSettings> | null): AutomationSchedulerSettings {
  const runHour = Number(value?.runHour);
  const normalizedHour = Number.isInteger(runHour) && runHour >= 0 && runHour <= 23
    ? runHour
    : DEFAULT_AUTOMATION_SCHEDULER.runHour;
  const lastRunStatus = value?.lastRunStatus;
  return {
    ...DEFAULT_AUTOMATION_SCHEDULER,
    ...(value || {}),
    enabled: value?.enabled !== false,
    runHour: normalizedHour,
    timezone: String(value?.timezone || DEFAULT_AUTOMATION_SCHEDULER.timezone),
    lastRunDate: value?.lastRunDate || null,
    lastRunAt: value?.lastRunAt || null,
    lastRunStatus: lastRunStatus === "success" || lastRunStatus === "partial" || lastRunStatus === "failed" ? lastRunStatus : "never",
    lastRunSummary: value?.lastRunSummary || null,
  };
}

const AUTOMATION_ENGINE_VERSION_KEY = "rebook_automation_engine_version";
const AUTOMATION_ENGINE_VERSION = "3";

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to load ${key} from storage:`, e);
  }
  return fallback;
}

function saveStored<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save ${key} to storage:`, e);
  }
}

const defaultInitialMessages: CustomerMessage[] = [
  {
    id: "m-1",
    customerId: 1,
    text: "Hi Priya! We miss you at Glam Studio 💖 It's been a while since your last visit. Come back this week and get 15% off on any service!",
    date: "Aug 12, 2026",
    channel: "WhatsApp",
    opened: true,
  },
  {
    id: "m-2",
    customerId: 1,
    text: "Hey Priya, it's been 30 days since your last visit at Glam Studio. How about treating yourself?",
    date: "Jul 11, 2026",
    channel: "SMS",
    opened: false,
  },
  {
    id: "m-3",
    customerId: 3,
    text: "Hi Sunita! Celebrate with a special 20% discount on your birthday month at Glam Studio.",
    date: "Sep 01, 2026",
    channel: "WhatsApp",
    opened: true,
  },
  {
    id: "m-4",
    customerId: 7,
    text: "Hi Meena! Special 60-day win-back offer: 15% off any hair service this week.",
    date: "Aug 20, 2026",
    channel: "WhatsApp",
    opened: true,
  },
];

const defaultSalon: SalonSettings = {
  name: "Glam Studio",
  phone: "+91 98765 00000",
  email: "hello@glamstudio.in",
  address: "Shop 12, Infinity Mall, Andheri West, Mumbai 400053",
  city: "Mumbai",
};

const defaultNotifications: NotificationSettings = {
  whatsapp: true,
  sms: true,
  email: false,
  dailySummary: true,
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children, runtime = null }: { children: React.ReactNode; runtime?: ShopRuntime | null }) {
  const isCloud = runtime?.mode === "cloud";
  const [cloudLoaded, setCloudLoaded] = useState(!isCloud);
  const [cloudError, setCloudError] = useState("");
  const cloudBaselineRef = useRef<Record<string, string>>({});
  const [customers, setCustomers] = useState<Customer[]>(() =>
    loadStored(STORAGE_KEYS.CUSTOMERS, initialCustomers as Customer[])
  );

  const [bookings, setBookings] = useState<Booking[]>(() =>
    loadStored(STORAGE_KEYS.BOOKINGS, initialBookings as Booking[])
  );

  const [visitHistory, setVisitHistory] = useState<Record<number, VisitRecord[]>>(() =>
    loadStored(STORAGE_KEYS.VISITS, initialVisitHistory as Record<number, VisitRecord[]>)
  );

  const [automations, setAutomations] = useState<Automation[]>(() => loadAutomationState());

  const [campaigns, setCampaigns] = useState<Campaign[]>(() =>
    loadStored(STORAGE_KEYS.CAMPAIGNS, initialCampaigns as Campaign[])
  );

  const [customerMessages, setCustomerMessages] = useState<CustomerMessage[]>(() =>
    loadStored(STORAGE_KEYS.MESSAGES, defaultInitialMessages)
  );

  const [salon, setSalon] = useState<SalonSettings>(() =>
    loadStored(STORAGE_KEYS.SALON, defaultSalon)
  );

  const [notifications, setNotifications] = useState<NotificationSettings>(() =>
    loadStored(STORAGE_KEYS.NOTIFICATIONS, defaultNotifications)
  );

  const [automationScheduler, setAutomationScheduler] = useState<AutomationSchedulerSettings>(() =>
    normalizeAutomationScheduler(loadStored(STORAGE_KEYS.AUTOMATION_SCHEDULER, DEFAULT_AUTOMATION_SCHEDULER))
  );

  const [staff, setStaff] = useState<ShopAssistant[]>(() =>
    loadStored(STORAGE_KEYS.STAFF, initialStaff as ShopAssistant[])
  );

  // Cloud mode loads from the shop's Firebase-backed API before rendering the app.
  useEffect(() => {
    if (!isCloud || !runtime) return;
    let cancelled = false;
    setCloudLoaded(false);
    setCloudError("");
    setAutomationCloudRuntime(runtime);
    void getCloudState(runtime).then((state) => {
      if (cancelled) return;
      setCustomers(Array.isArray(state.customers) ? state.customers : []);
      setBookings(Array.isArray(state.bookings) ? state.bookings : []);
      setVisitHistory(state.visitHistory && typeof state.visitHistory === "object" ? state.visitHistory : {});
      setCampaigns(Array.isArray(state.campaigns) ? state.campaigns : []);
      setCustomerMessages(Array.isArray(state.messages) ? state.messages : []);
      const cloudSalon = state.salon || {
        ...defaultSalon,
        name: runtime.shop.shopName,
        phone: runtime.shop.phone || "",
        email: runtime.shop.ownerEmail || "",
        address: runtime.shop.address || "",
      };
      setSalon(cloudSalon);
      setNotifications(state.notifications || defaultNotifications);
      setAutomationScheduler(normalizeAutomationScheduler(state.automationScheduler));
      setStaff(Array.isArray(state.staff) ? state.staff : []);
      const cloudAutomations = Array.isArray(state.automations) ? state.automations : [];
      const cloudRuns = Array.isArray(state.automationRuns) ? state.automationRuns : [];
      runsRef.current = cloudRuns;
      setAutomations(cloudAutomations.map((auto: Automation) => syncAutomationStats(auto, cloudRuns)));
      cloudBaselineRef.current = {
        customers: JSON.stringify(Array.isArray(state.customers) ? state.customers : []),
        bookings: JSON.stringify(Array.isArray(state.bookings) ? state.bookings : []),
        visits: JSON.stringify(state.visitHistory && typeof state.visitHistory === "object" ? state.visitHistory : {}),
        automations: JSON.stringify(cloudAutomations),
        campaigns: JSON.stringify(Array.isArray(state.campaigns) ? state.campaigns : []),
        messages: JSON.stringify(Array.isArray(state.messages) ? state.messages : []),
        salon: JSON.stringify(cloudSalon),
        notifications: JSON.stringify(state.notifications || defaultNotifications),
        automationScheduler: JSON.stringify(normalizeAutomationScheduler(state.automationScheduler)),
        staff: JSON.stringify(Array.isArray(state.staff) ? state.staff : []),
      };
      setCloudLoaded(true);
    }).catch((error) => {
      if (cancelled) return;
      console.error("Failed to load cloud shop data:", error);
      setCloudError(error instanceof Error ? error.message : "Unable to load shop data.");
    });
    return () => {
      cancelled = true;
      setAutomationCloudRuntime(null);
    };
  }, [isCloud, runtime?.shopId, runtime?.accessToken]);

  // Sync to local storage only for the demo/local app.
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.CUSTOMERS, customers); }, [customers, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.BOOKINGS, bookings); }, [bookings, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.VISITS, visitHistory); }, [visitHistory, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.AUTOMATIONS, automations); }, [automations, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.CAMPAIGNS, campaigns); }, [campaigns, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.MESSAGES, customerMessages); }, [customerMessages, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.SALON, salon); }, [salon, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.NOTIFICATIONS, notifications); }, [notifications, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.AUTOMATION_SCHEDULER, automationScheduler); }, [automationScheduler, isCloud]);
  useEffect(() => { if (!isCloud) saveStored(STORAGE_KEYS.STAFF, staff); }, [staff, isCloud]);

  const cloudSyncArray = (collection: string, value: unknown[], key = "id") => {
    if (!isCloud || !runtime || !cloudLoaded) return;
    const serialized = JSON.stringify(value);
    const previousSerialized = cloudBaselineRef.current[collection];
    if (previousSerialized === serialized) return;
    const previous = previousSerialized ? JSON.parse(previousSerialized) : [];
    const previousMap = new Map<string, any>((previous || []).map((item: any) => [String(item?.[key]), item]));
    const currentMap = new Map<string, any>((value || []).map((item: any) => [String((item as any)?.[key]), item]));
    const upserts = (value || []).filter((item: any) => {
      const id = String(item?.[key]);
      return JSON.stringify(previousMap.get(id)) !== JSON.stringify(item);
    }).map((item: any) => ({ ...item, __docId: item?.[key] }));
    const deletes = Array.from(previousMap.keys()).filter((id) => !currentMap.has(id));
    cloudBaselineRef.current[collection] = serialized;
    if (!upserts.length && !deletes.length) return;
    void syncCloudCollection(runtime, collection, upserts, deletes).catch((error) => console.error(`Cloud sync failed for ${collection}:`, error));
  };

  useEffect(() => cloudSyncArray("customers", customers), [customers, isCloud, cloudLoaded]);
  useEffect(() => cloudSyncArray("bookings", bookings), [bookings, isCloud, cloudLoaded]);
  useEffect(() => cloudSyncArray("automations", automations), [automations, isCloud, cloudLoaded]);
  useEffect(() => cloudSyncArray("campaigns", campaigns), [campaigns, isCloud, cloudLoaded]);
  useEffect(() => cloudSyncArray("messages", customerMessages), [customerMessages, isCloud, cloudLoaded]);
  useEffect(() => cloudSyncArray("staff", staff), [staff, isCloud, cloudLoaded]);
  useEffect(() => {
    if (!isCloud || !runtime || !cloudLoaded) return;
    const serialized = JSON.stringify(visitHistory);
    if (cloudBaselineRef.current.visits === serialized) return;
    const previousValue = cloudBaselineRef.current.visits;
    cloudBaselineRef.current.visits = serialized;
    const previous = JSON.parse(previousValue || "{}");
    const upserts = Object.entries(visitHistory).map(([id, records]) => ({ __docId: id, records }));
    const deletes = Object.keys(previous).filter((id) => !(id in visitHistory));
    void syncCloudCollection(runtime, "visits", upserts, deletes).catch((error) => console.error("Cloud sync failed for visits:", error));
  }, [visitHistory, isCloud, cloudLoaded]);
  useEffect(() => {
    if (!isCloud || !runtime || !cloudLoaded) return;
    const serialized = JSON.stringify(salon);
    if (cloudBaselineRef.current.salon === serialized) return;
    cloudBaselineRef.current.salon = serialized;
    void syncCloudCollection(runtime, "salon", [{ __docId: "current", ...salon }]).catch((error) => console.error("Cloud sync failed for salon:", error));
  }, [salon, isCloud, cloudLoaded]);
  useEffect(() => {
    if (!isCloud || !runtime || !cloudLoaded) return;
    const serialized = JSON.stringify(notifications);
    if (cloudBaselineRef.current.notifications === serialized) return;
    cloudBaselineRef.current.notifications = serialized;
    void syncCloudCollection(runtime, "notifications", [{ __docId: "current", ...notifications }]).catch((error) => console.error("Cloud sync failed for notifications:", error));
  }, [notifications, isCloud, cloudLoaded]);
  useEffect(() => {
    if (!isCloud || !runtime || !cloudLoaded) return;
    const serialized = JSON.stringify(automationScheduler);
    if (cloudBaselineRef.current.automationScheduler === serialized) return;
    cloudBaselineRef.current.automationScheduler = serialized;
    void syncCloudCollection(runtime, "automationScheduler", [{ __docId: "current", ...automationScheduler }]).catch((error) => console.error("Cloud sync failed for automation scheduler:", error));
  }, [automationScheduler, isCloud, cloudLoaded]);


  // Execution history — stored in a ref so reads/writes don't trigger re-renders
  const runsRef = useRef<AutomationRun[]>(
    loadStored<AutomationRun[]>(STORAGE_KEYS.AUTOMATION_RUNS, [])
  );

  // Inactivity automations are executed by the server-side scheduled runner.
  // The browser only fires event-driven ₹5,000+ booking automations immediately.

  // --- Actions ---

  const addCustomer = (customerData: Omit<Customer, "id"> & { id?: number }): Customer => {
    const formattedPhone = customerData.phone ? formatPhone(customerData.phone) : "";
    const normPhone = normalizePhone(formattedPhone);

    // Rule 9: Do not generate a new customer if normalized phone already exists
    if (normPhone.length === 10) {
      const existing = customers.find((c) => normalizePhone(c.phone) === normPhone);
      if (existing) {
        return existing;
      }
    }

    const id = customerData.id || Date.now();
    const initials = customerData.avatar || customerData.name
      .trim()
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "CU";

    const newCustomer: Customer = {
      id,
      name: customerData.name.trim(),
      phone: formattedPhone,
      email: customerData.email || "",
      status: customerData.status || "active",
      lastVisit: customerData.lastVisit || new Date().toISOString().split("T")[0],
      totalVisits: customerData.totalVisits ?? 0,
      totalSpend: customerData.totalSpend ?? 0,
      favouriteService: customerData.favouriteService || "Hair Colour & Highlights",
      tags: customerData.tags || ["New"],
      notes: customerData.notes || "",
      avatar: initials,
      lifecycle: customerData.lifecycle || ((Number(customerData.totalVisits) || 0) >= 2 ? "Repeat" : "New"),
    };

    setCustomers((prev) => [newCustomer, ...prev]);
    return newCustomer;
  };

  const updateCustomer = (id: number, updates: Partial<Customer>) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const importCustomers = (newCustomers: Array<Partial<Customer> & { name: string }>): number => {
    if (!newCustomers.length) return 0;
    const todayStr = new Date().toISOString().split("T")[0];
    let nextId = Date.now();
    const existingPhones = new Set(
      customers.map((c) => normalizePhone(c.phone)).filter((phone) => phone.length === 10)
    );
    const created: Customer[] = [];

    for (const item of newCustomers) {
      const phone = item.phone ? formatPhone(item.phone) : "";
      const normalized = normalizePhone(phone);
      // Phone is the primary identity key. Never import a second customer with
      // the same valid 10-digit phone number.
      if (normalized.length === 10 && existingPhones.has(normalized)) continue;
      if (normalized.length === 10) existingPhones.add(normalized);

      const initials = item.name
        .trim()
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "CU";

      created.push({
        id: nextId++,
        name: item.name.trim(),
        phone,
        email: item.email || "",
        status: item.status || "active",
        lastVisit: item.lastVisit || todayStr,
        totalVisits: Number(item.totalVisits) || 0,
        totalSpend: Number(item.totalSpend) || 0,
        favouriteService: item.favouriteService || "Basic Facial",
        tags: item.tags || ["Imported"],
        notes: item.notes || "Imported via CSV",
        avatar: item.avatar || initials,
        lifecycle: item.lifecycle || (Number(item.totalVisits) >= 2 ? "Repeat" : "New"),
      });
    }

    if (created.length) setCustomers((prev) => [...created, ...prev]);
    return created.length;
  };

  const addVisitRecord = (customerId: number, record: VisitRecord) => {
    setVisitHistory((prev) => {
      const existing = prev[customerId] || [];
      return {
        ...prev,
        [customerId]: [record, ...existing],
      };
    });
  };

  const addBooking = (bookingData: Omit<Booking, "id"> & { id?: number }): Booking => {
    const id = bookingData.id || Date.now();
    const now = new Date().toISOString();
    const bookingType = bookingData.bookingType || "appointment";
    const formattedPhone = bookingData.customerPhone ? formatPhone(bookingData.customerPhone) : "";
    const normPhone = formattedPhone ? normalizePhone(formattedPhone) : "";

    let customerId = bookingData.customerId;
    let createdCustomer: Customer | undefined;

    // PHONE IS THE SINGLE IDENTITY KEY. Never prefer a supplied customerId
    // over a matching phone number. Names are never used for identity.
    const existingByPhone = normPhone.length === 10
      ? customers.find((c) => normalizePhone(c.phone) === normPhone)
      : undefined;

    if (existingByPhone) {
      customerId = existingByPhone.id;
      // The user-defined rule is explicit: once a saved customer books again
      // (appointment OR walk-in), that customer is immediately Repeat.
      setCustomers((prev) => prev.map((c) => {
        if (c.id !== existingByPhone.id) return c;
        const tags = Array.from(new Set(["Repeat", ...(c.tags || []).filter((tag) => tag !== "New" && tag !== "Repeat")]));
        return { ...c, tags, lifecycle: "Repeat" };
      }));
    } else if (normPhone.length === 10) {
      // A valid phone number that is not already in the database creates the
      // first customer record, even if a stale/legacy customerId was supplied.
      // This prevents a mismatched ID from overriding phone-based identity.
      const newCust = addCustomer({
        name: (bookingData.customer || "Unknown Client") as string,
        phone: formattedPhone,
        status: "active",
        email: "",
        // First-ever booking creates the customer and is therefore NEW.
        lastVisit: "",
        totalVisits: 0,
        totalSpend: 0,
        favouriteService: bookingData.service,
        tags: ["New"],
        notes: "",
        avatar: "CU",
        lifecycle: "New"
      });
      customerId = newCust.id;
      createdCustomer = newCust;
    } else if (customerId !== undefined) {
      const existingById = customers.find((c) => c.id === customerId);
      if (existingById) {
        // Explicit profile/customer selection is the safe legacy fallback when
        // there is no phone number to compare. It still represents a second
        // saved-customer transaction, so lifecycle becomes Repeat immediately.
        setCustomers((prev) => prev.map((c) => {
          if (c.id !== existingById.id) return c;
          const tags = Array.from(new Set(["Repeat", ...(c.tags || []).filter((tag) => tag !== "New" && tag !== "Repeat")]));
          return { ...c, tags };
        }));
      }
    }

    const isWalkIn = bookingType === "walk-in";
    const newBooking: Booking = {
      id,
      customer: bookingData.customer,
      customerId,
      customerPhone: formattedPhone || undefined,
      service: bookingData.service,
      date: bookingData.date || new Date().toISOString().split("T")[0],
      time: bookingData.time || "",
      staff: bookingData.staff || "Unknown",
      staffId: bookingData.staffId,
      amount: Number(bookingData.amount) || 0,
      // Walk-ins are already completed when recorded. Appointments remain pending
      // until the operator confirms/completes them.
      status: isWalkIn ? "completed" : (bookingData.status || "pending"),
      createdAt: bookingData.createdAt || now,
      confirmedAt: isWalkIn ? now : bookingData.confirmedAt,
      bookingType,
    };

    setBookings((prev) => [newBooking, ...prev]);

    if (newBooking.status === "confirmed" || newBooking.status === "completed") {
      processConfirmedBooking(newBooking, createdCustomer);
    }

    return newBooking;
  };

  const processConfirmedBooking = (booking: Booking, customerOverride?: Customer) => {
    const bookingAmt = Number(booking.amount) || 0;
    const staffMember = staff.find((s) => s.id === booking.staffId);
    const staffName = staffMember?.name || booking.staff;

    // Find matching customer using normalized phone as the primary identity.
    let target = customerOverride || customers.find((c) => isBookingForCustomer(booking, c));

    if (target) {
      const newTotalVisits = (Number(target.totalVisits) || 0) + 1;
      const newTotalSpend = (Number(target.totalSpend) || 0) + bookingAmt;
      const newStatus = target.status === "inactive" ? "won_back" : target.status;
      let updatedTags = [...(target.tags || [])];

      // Repeat is lifecycle state, not a manually editable guess. Once the app
      // has already saved this customer and another booking/walk-in is recorded,
      // keep Repeat permanently attached to the customer record.
      if (newTotalVisits >= 2 || updatedTags.some((tag) => tag.trim().toLowerCase() === "repeat")) {
        updatedTags = ["Repeat", ...updatedTags.filter((t) => t !== "New" && t !== "Repeat")];
      }
      if (newStatus === "won_back" && !updatedTags.includes("Won Back")) {
        updatedTags = ["Won Back", ...updatedTags.filter((t) => t !== "Lapsed" && t !== "At Risk")];
      }

      const updatedTarget: Customer = {
        ...target,
        totalSpend: newTotalSpend,
        totalVisits: newTotalVisits,
        lastVisit: booking.date || new Date().toISOString().split("T")[0],
        status: newStatus,
        tags: updatedTags,
        lifecycle: newTotalVisits >= 2 || target.lifecycle === "Repeat" ? "Repeat" : "New",
      };
      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === target.id);
        return exists ? prev.map((c) => (c.id === target.id ? updatedTarget : c)) : [updatedTarget, ...prev];
      });

      addVisitRecord(target.id, {
        date: booking.date || new Date().toISOString().split("T")[0],
        service: booking.service,
        amount: bookingAmt,
        staff: staffName || "Unknown",
      });

      // A single confirmed/completed booking of ₹5,000+ is the ONLY trigger for
      // the spend automation. It must not be inferred from cumulative customer spend.
      void executeSpendAutomationsForBooking(booking, target, automations, runsRef, setAutomations);

      // Attribute a later booking to the latest eligible automation message only.
      checkAutomationConversions(target.id, booking.id, booking.confirmedAt || booking.createdAt || new Date().toISOString(), runsRef, setAutomations);
    }
  };

  const updateBookingStatus = (id: number, status: Booking["status"]) => {
    const existing = bookings.find((b) => b.id === id);
    if (!existing) return;

    // Completed bookings are final; they cannot be cancelled or re-completed.
    if (existing.status === "completed") return;

    const prevStatus = existing.status;
    const now = new Date().toISOString();
    const nextBooking = {
      ...existing,
      status,
      confirmedAt: (status === "confirmed" || status === "completed") ? (existing.confirmedAt || now) : existing.confirmedAt,
    };

    setBookings((prev) =>
      prev.map((b) => (b.id === id ? nextBooking : b))
    );

    // Process the first transition into a confirmed/completed state exactly once.
    if ((prevStatus === "pending" || prevStatus === "cancelled") && (status === "confirmed" || status === "completed")) {
      processConfirmedBooking(nextBooking);
    }
  };

  const logCustomerMessage = (customerId: number, text: string, channel: string, campaignId?: number) => {
    const newMsg: CustomerMessage = {
      id: "msg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      customerId,
      text,
      channel,
      date: new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }),
      opened: true,
      campaignId,
    };
    setCustomerMessages((prev) => [newMsg, ...prev]);
  };

  const getCustomerMessages = (customerId: number) => {
    return customerMessages.filter((m) => m.customerId === customerId);
  };

  const toggleAutomation = (id: number) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: a.status === "active" ? "inactive" : "active" } : a))
    );
  };

  const saveAutomation = (autoData: Partial<Automation> & { name: string; trigger: string; action: string; message: string; id?: number }) => {
    if (autoData.id) {
      setAutomations((prev) =>
        prev.map((a) => (a.id === autoData.id ? { ...a, ...autoData } : a))
      );
    } else {
      const newAuto: Automation = {
        id: Date.now(),
        name: autoData.name,
        trigger: autoData.trigger,
        action: autoData.action,
        message: autoData.message,
        status: "active",
        triggered: 0,
        converted: 0,
        conversionRate: 0,
      };
      setAutomations((prev) => [...prev, newAuto]);
    }
  };

  const addCampaign = (campaignData: Omit<Campaign, "id">): Campaign => {
    const newCamp: Campaign = {
      ...campaignData,
      id: Date.now(),
    };
    setCampaigns((prev) => [newCamp, ...prev]);
    return newCamp;
  };

  const recordBlastResults = (
    campaignId: number,
    sentCount: number,
    recipientIds: number[],
    channel: string = "WhatsApp",
    messageText: string = "Campaign message sent"
  ) => {
    // 1. Update campaign sent count and status
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              sent: (c.sent || 0) + sentCount,
              status: "completed",
              date: new Date().toISOString().split("T")[0],
            }
          : c
      )
    );

    // 2. Add message to each recipient's timeline with campaignId
    recipientIds.forEach((cid) => {
      logCustomerMessage(cid, messageText, channel, campaignId);
    });
  };

  const updateSalon = (updates: Partial<SalonSettings>) => {
    setSalon((prev) => ({ ...prev, ...updates }));
  };

  const updateNotifications = (updates: Partial<NotificationSettings>) => {
    setNotifications((prev) => ({ ...prev, ...updates }));
  };

  const updateAutomationScheduler = (updates: Partial<AutomationSchedulerSettings>) => {
    setAutomationScheduler((prev) => normalizeAutomationScheduler({ ...prev, ...updates }));
  };

  const addStaff = (assistant: Omit<ShopAssistant, "id">) => {
    setStaff((prev) => [...prev, { 
      ...assistant, 
      id: Date.now(), 
      workingDays: assistant.workingDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], 
      startTime: assistant.startTime || "09:00", 
      endTime: assistant.endTime || "18:00" 
    }]);
  };

  const updateStaff = (id: number, assistant: Partial<ShopAssistant>) => {
    setStaff((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...assistant } : a))
    );
  };

  const deleteStaff = (id: number) => {
    setStaff((prev) => prev.filter((a) => a.id !== id));
  };

  const resetAppData = () => {
    if (isCloud && runtime) {
      void resetCloudData(runtime).then(() => {
        setCustomers([]);
        setBookings([]);
        setVisitHistory({});
        setAutomations([]);
        setCampaigns([]);
        setCustomerMessages([]);
        setSalon(defaultSalon);
        setNotifications(defaultNotifications);
        setAutomationScheduler(DEFAULT_AUTOMATION_SCHEDULER);
        setStaff([]);
        runsRef.current = [];
      }).catch((error) => console.error("Cloud reset failed:", error));
      return;
    }

    // Clear all rebook storage keys
    Object.values(STORAGE_KEYS).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });

    // Reset in-memory state to canonical defaults
    setCustomers(initialCustomers as Customer[]);
    setBookings(initialBookings as Booking[]);
    setVisitHistory(initialVisitHistory as Record<number, VisitRecord[]>);
    runsRef.current = [];
    setAutomations(resetAutomationStats(initialAutomations as Automation[]));
    setCampaigns(initialCampaigns as Campaign[]);
    setCustomerMessages(defaultInitialMessages);
    setSalon(defaultSalon);
    setNotifications(defaultNotifications);
    setAutomationScheduler(DEFAULT_AUTOMATION_SCHEDULER);
    setStaff(initialStaff as ShopAssistant[]);
  };


  // --- Dynamic Derived Stats ---
  // Confirmed & Completed bookings
  const confirmedBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");

  // Initial confirmed baseline was IDs 1, 2, 4, 5 (2800 + 500 + 4500 + 3200 = 11,000)
  // Any booking confirmed beyond that (e.g. pending ones confirmed: #3 Anjali ₹700, #6 Meena ₹1200, or any newly created bookings)
  // dynamically adds to totalRecoveredRevenue!
  const extraBookingRevenue = confirmedBookings.reduce((sum, b) => {
    if ([1, 2, 4, 5].includes(b.id)) return sum; // Already part of baseline 68,400
    return sum + (Number(b.amount) || 0);
  }, 0);

  // If any initial baseline booking was cancelled, adjust baseline accordingly
  const baselineDeduction = [1, 2, 4, 5].reduce((sum, baseId) => {
    const b = bookings.find((item) => item.id === baseId);
    if (!b || b.status === "cancelled") {
      const origAmount = baseId === 1 ? 2800 : baseId === 2 ? 500 : baseId === 4 ? 4500 : 3200;
      return sum + origAmount;
    }
    return sum;
  }, 0);

  const totalRecoveredRevenue = Math.max(0, 68400 - baselineDeduction + extraBookingRevenue);

  // Monthly revenue data dynamically adjusted for confirmed bookings
  const monthlyRevenueData = initialAnalyticsData.monthly.map((m) => {
    // Calculate extra confirmed bookings revenue falling into this month
    const extraForMonth = confirmedBookings.reduce((sum, b) => {
      if ([1, 2, 4, 5].includes(b.id)) return sum;
      let bMonth = "Sep";
      if (b.date) {
        try {
          bMonth = new Date(b.date).toLocaleString("en-US", { month: "short" });
        } catch (e) {}
      }
      return bMonth === m.month ? sum + (Number(b.amount) || 0) : sum;
    }, 0);

    const wonBackCount = customers.filter((c) => c.status === "won_back").length;

    if (m.month === "Sep") {
      return {
        ...m,
        revenue: m.revenue + extraForMonth,
        returned: Math.max(m.returned, wonBackCount),
      };
    }
    return {
      ...m,
      revenue: m.revenue + extraForMonth,
    };
  });

  const dynamicCampaigns = campaigns.map((c) => {
    const campaignMessages = customerMessages.filter((m) => m.campaignId === c.id);
    if (campaignMessages.length === 0) {
      return c;
    }

    const sent = campaignMessages.length;
    const opened = campaignMessages.filter((m) => m.opened).length;

    // Find unique customer IDs who received this campaign
    const recipientIds = Array.from(new Set(campaignMessages.map((m) => m.customerId)));

    // Find recipients who have a confirmed or completed booking on or after the campaign's date
    const converted = customers.filter((cust) => {
      if (!recipientIds.includes(cust.id)) return false;
      return bookings.some((b) => {
        const isMatch = isBookingForCustomer(b, cust);
        const isConfirmed = b.status === "confirmed" || b.status === "completed";
        const isAfterOrOn = b.date >= c.date;
        return isMatch && isConfirmed && isAfterOrOn;
      });
    }).length;

    return {
      ...c,
      sent,
      opened,
      converted,
    };
  });

  if (isCloud && cloudError) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--background)" }}>
        <div className="stat-card" style={{ maxWidth: 560, padding: 28 }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Unable to load shop data</div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{cloudError}</div>
        </div>
      </div>
    );
  }
  if (isCloud && !cloudLoaded) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--background)", color: "var(--muted-foreground)" }}>Loading ReBook data…</div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        customers,
        addCustomer,
        updateCustomer,
        importCustomers,
        bookings,
        addBooking,
        updateBookingStatus,
        visitHistory,
        addVisitRecord,
        customerMessages,
        logCustomerMessage,
        getCustomerMessages,
        automations,
        toggleAutomation,
        saveAutomation,
        automationScheduler,
        updateAutomationScheduler,
        campaigns: dynamicCampaigns,
        addCampaign,
        recordBlastResults,
        salon,
        updateSalon,
        notifications,
        updateNotifications,
        staff,
        addStaff,
        updateStaff,
        deleteStaff,
        resetAppData,
        totalRecoveredRevenue,
        monthlyRevenueData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

function resetAutomationStats(autos: Automation[]): Automation[] {
  return autos.map((auto) => ({
    ...auto,
    triggered: 0,
    converted: 0,
    conversionRate: 0,
    triggeredCustomerIds: [],
  }));
}

function syncAutomationStats(auto: Automation, runs: AutomationRun[]): Automation {
  const successfulRuns = runs.filter(
    (r) => r.automationId === auto.id && (r.status === "queued" || r.status === "sent" || r.status === "recorded")
  );
  const converted = successfulRuns.filter((r) => r.bookingId !== undefined).length;
  const triggered = successfulRuns.length;
  const triggeredCustomerIds = Array.from(new Set(successfulRuns.map((r) => r.customerId)));
  const conversionRate = triggered > 0 ? Number(((converted / triggered) * 100).toFixed(1)) : 0;

  return {
    ...auto,
    triggered,
    converted,
    conversionRate,
    triggeredCustomerIds,
  };
}

function loadAutomationState(): Automation[] {
  try {
    const version = localStorage.getItem(AUTOMATION_ENGINE_VERSION_KEY);
    if (version !== AUTOMATION_ENGINE_VERSION) {
      localStorage.removeItem(STORAGE_KEYS.AUTOMATION_RUNS);
      localStorage.setItem(AUTOMATION_ENGINE_VERSION_KEY, AUTOMATION_ENGINE_VERSION);
    }
  } catch {
    // Continue with in-memory defaults if storage is unavailable.
  }

  const loaded = loadStored<Automation[]>(STORAGE_KEYS.AUTOMATIONS, initialAutomations as Automation[]);
  const runs = loadStored<AutomationRun[]>(STORAGE_KEYS.AUTOMATION_RUNS, []);
  return loaded.map((auto) => syncAutomationStats(auto, runs));
}

function evaluateCustomerForTrigger(customer: Customer, trigger: string): boolean {
  const triggerLower = (trigger || "").toLowerCase();
  const lastVisitTime = customer.lastVisit ? new Date(customer.lastVisit).getTime() : NaN;
  if (!Number.isFinite(lastVisitTime)) return false;

  const daysSince = Math.floor((Date.now() - lastVisitTime) / 86400000);

  if (triggerLower.includes("30 days")) return daysSince >= 30;
  if (triggerLower.includes("60 days")) return daysSince >= 60;
  if (triggerLower.includes("90 days")) return daysSince >= 90;
  if (triggerLower.includes("1 day after")) return daysSince >= 1;

  // Birthday automation cannot be made guess-free without a real birthday date
  // field. Only a future implementation with an actual date should trigger it.
  if (triggerLower.includes("birthday")) return false;

  // Spend automation is event-driven from an actual qualifying booking and is
  // deliberately NOT evaluated from customer.totalSpend.
  if (triggerLower.includes("5,000")) return false;

  return false;
}

function getDedupeKey(automationId: number, customer: Customer, trigger: string): string {
  const triggerLower = (trigger || "").toLowerCase();
  let bucket = "default";

  if (triggerLower.includes("30 days") || triggerLower.includes("60 days") || triggerLower.includes("90 days") || triggerLower.includes("1 day after")) {
    // One run per actual last-visit date. This prevents repeated messages after
    // refreshes while allowing a fresh cycle after the customer visits again.
    bucket = `visit:${customer.lastVisit || "unknown"}`;
  } else if (triggerLower.includes("birthday")) {
    bucket = `bday:${new Date().getFullYear()}`;
  }

  return `${automationId}:${customer.id}:${bucket}`;
}

async function runAutomationAction(
  auto: Automation,
  customer: Customer,
): Promise<AutomationRun["status"] | null> {
  const actionLower = (auto.action || "").toLowerCase();
  const isWhatsApp = actionLower.includes("whatsapp");

  if (isWhatsApp) {
    if (customer.whatsappOptIn !== true) return null;
    const phone = (customer.phone || "").trim();
    if (!phone || normalizePhone(phone).length !== 10) return null;

    const personalised = (auto.message || "").replace(/\{name\}/gi, customer.name.trim().split(" ")[0] || customer.name);
    try {
      const result = await sendSingleViaBridge(phone, personalised, customer.name);
      return result.success ? "sent" : null;
    } catch {
      return null;
    }
  }

  // SMS and Email are intentionally not executed because ReBook has no
  // delivery provider connected for those channels.
  return null;
}

async function executeAutomations(
  automations: Automation[],
  customers: Customer[],
  runsRef: React.MutableRefObject<AutomationRun[]>,
  setAutomations: React.Dispatch<React.SetStateAction<Automation[]>>
): Promise<void> {
  const activeAutomations = automations.filter((a) => a.status === "active");
  if (activeAutomations.length === 0) return;

  for (const auto of activeAutomations) {
    // Spend automations are triggered by booking events, never by cumulative spend.
    if ((auto.trigger || "").toLowerCase().includes("5,000")) continue;

    for (const customer of customers) {
      if (!evaluateCustomerForTrigger(customer, auto.trigger)) continue;

      const dedupeKey = getDedupeKey(auto.id, customer, auto.trigger);
      if (runsRef.current.some((r) => r.dedupeKey === dedupeKey && (r.status === "sent" || r.status === "recorded"))) {
        continue;
      }

      const runStatus = await runAutomationAction(auto, customer);
      if (!runStatus) continue;

      const newRun: AutomationRun = {
        automationId: auto.id,
        customerId: customer.id,
        triggeredAt: new Date().toISOString(),
        status: runStatus,
        dedupeKey,
      };
      runsRef.current = [...runsRef.current, newRun];
      saveAutomationRuns(runsRef.current);
      syncAutomationInState(auto.id, runsRef.current, setAutomations);
    }
  }
}

async function executeSpendAutomationsForBooking(
  booking: Booking,
  customer: Customer,
  automations: Automation[],
  runsRef: React.MutableRefObject<AutomationRun[]>,
  setAutomations: React.Dispatch<React.SetStateAction<Automation[]>>
): Promise<void> {
  const amount = Number(booking.amount) || 0;
  if (amount < 5000) return;
  if (booking.status !== "confirmed" && booking.status !== "completed") return;

  const spendAutomations = automations.filter(
    (auto) => auto.status === "active" && (auto.trigger || "").toLowerCase().includes("5,000")
  );
  if (spendAutomations.length === 0) return;

  for (const auto of spendAutomations) {
    const dedupeKey = `${auto.id}:customer:${customer.id}:booking:${booking.id}`;
    if (runsRef.current.some((r) => r.dedupeKey === dedupeKey && (r.status === "sent" || r.status === "recorded"))) continue;

    const runStatus = await runAutomationAction(auto, customer);
    if (!runStatus) continue;

    const newRun: AutomationRun = {
      automationId: auto.id,
      customerId: customer.id,
      triggeredAt: booking.confirmedAt || booking.createdAt || new Date().toISOString(),
      status: runStatus,
      dedupeKey,
      triggerBookingId: booking.id,
    };
    runsRef.current = [...runsRef.current, newRun];
    saveAutomationRuns(runsRef.current);
    syncAutomationInState(auto.id, runsRef.current, setAutomations);
  }
}

function saveAutomationRuns(runs: AutomationRun[]): void {
  if (automationCloudRuntime) {
    const upserts = runs.map((run) => ({
      ...run,
      __docId: sha256(`${run.dedupeKey}|${run.triggeredAt}`),
    }));
    void syncCloudCollection(automationCloudRuntime, "automationRuns", upserts).catch((error) => {
      console.error("Cloud sync failed for automation runs:", error);
    });
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEYS.AUTOMATION_RUNS, JSON.stringify(runs));
  } catch {
    // Storage quota or private-mode failure; keep the in-memory source of truth.
  }
}

function syncAutomationInState(
  automationId: number,
  runs: AutomationRun[],
  setAutomations: React.Dispatch<React.SetStateAction<Automation[]>>
): void {
  setAutomations((prev) =>
    prev.map((auto) => auto.id === automationId ? syncAutomationStats(auto, runs) : auto)
  );
}

/**
 * Last-touch attribution with a 7-day conversion window:
 * - only successful/recorded automation runs count as triggered
 * - a booking can convert at most one automation run
 * - the booking must happen after the run and within 7 days
 * - a spend-triggering booking can never convert itself
 */
function checkAutomationConversions(
  customerId: number,
  bookingId: number,
  bookingConfirmedAt: string,
  runsRef: React.MutableRefObject<AutomationRun[]>,
  setAutomations: React.Dispatch<React.SetStateAction<Automation[]>>
): void {
  const bookingTime = new Date(bookingConfirmedAt).getTime();
  if (!Number.isFinite(bookingTime)) return;

  const eligible = runsRef.current
    .filter((run) => {
      if (run.customerId !== customerId) return false;
      if (run.bookingId !== undefined) return false;
      if (run.triggerBookingId === bookingId) return false;
      if (run.status !== "sent" && run.status !== "recorded") return false;
      const triggerTime = new Date(run.triggeredAt).getTime();
      if (!Number.isFinite(triggerTime) || triggerTime > bookingTime) return false;
      const diffDays = (bookingTime - triggerTime) / 86400000;
      return diffDays >= 0 && diffDays <= AUTOMATION_CONVERSION_WINDOW_DAYS;
    })
    .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());

  const winningRun = eligible[0];
  if (!winningRun) return;

  const now = new Date().toISOString();
  const updatedRuns = runsRef.current.map((run) =>
    run.automationId === winningRun.automationId &&
    run.customerId === winningRun.customerId &&
    run.dedupeKey === winningRun.dedupeKey
      ? { ...run, convertedAt: now, bookingId }
      : run
  );

  runsRef.current = updatedRuns;
  saveAutomationRuns(updatedRuns);
  syncAutomationInState(winningRun.automationId, updatedRuns, setAutomations);
}

export function useApp() {

  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
export default AppContext;
