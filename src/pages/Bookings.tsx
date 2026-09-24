import { useState } from "react";
import { useApp, isRepeatCustomer, normalizePhone } from "../context/AppContext";

const services = ["Hair Colour & Highlights", "Keratin Treatment", "Facial & Cleanup", "Manicure & Pedicure", "Blow Dry & Styling", "Hair Spa", "Bridal Package", "Threading & Waxing", "Balayage", "Nail Art"];
const appointmentTimes = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

function timeToMinutes(time: string): number {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return NaN;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) {
    if (hour === 12) hour = 0;
    if (meridiem === "PM") hour += 12;
  }
  return hour * 60 + minute;
}

function formatTime(time: string): string {
  const mins = timeToMinutes(time);
  if (!Number.isFinite(mins)) return time;
  const hour24 = Math.floor(mins / 60);
  const minute = mins % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export default function Bookings() {
  const { bookings, customers, staff, addBooking: addGlobalBooking, updateBookingStatus } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [bookingType, setBookingType] = useState<"walk-in" | "appointment">("walk-in");
  const [bookingError, setBookingError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const getLocalDateString = (dateObj: Date): string => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateString(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrowDate);

  const [form, setForm] = useState({ 
    customer: "", 
    phone: "", 
    service: services[0], 
    date: todayStr, 
    time: "10:00", 
    staffId: staff.length > 0 ? staff[0].id : 0, 
    amount: "" 
  });

  const resetForm = () => {
    setForm({
      customer: "",
      phone: "",
      service: services[0],
      date: todayStr,
      time: "10:00",
      staffId: staff.length > 0 ? staff[0].id : 0,
      amount: "",
    });
    setBookingError("");
  };

  const addBooking = () => {
    if (isSaving) return;
    setBookingError("");

    const customerName = form.customer.trim();
    if (!customerName) {
      setBookingError("Customer name is required.");
      return;
    }
    if (form.phone.trim() && normalizePhone(form.phone).length !== 10) {
      setBookingError("Please enter a valid 10-digit phone number or leave it blank.");
      return;
    }

    let selectedStaff: any | undefined;
    if (bookingType === "appointment") {
      if (!form.date) {
        setBookingError("Please select a booking date.");
        return;
      }
      // LocalStorage can contain legacy/string staff IDs. Compare by string so the
      // selected staff remains valid regardless of whether the stored ID is 3 or "3".
      selectedStaff = staff.find((s) => String(s.id) === String(form.staffId));
      if (!selectedStaff) {
        setBookingError("Please select an available staff member.");
        return;
      }
      if (selectedStaff.active === false) {
        setBookingError("Selected staff member is unavailable.");
        return;
      }

      // Legacy staff records may not contain scheduling fields. In that case do not
      // block booking; only enforce the schedule when the data actually exists.
      const dayName = new Date(`${form.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
      const workingDays = Array.isArray(selectedStaff.workingDays) ? selectedStaff.workingDays : [];
      if (workingDays.length > 0 && !workingDays.includes(dayName)) {
        setBookingError(`${selectedStaff.name} is not working on ${dayName}.`);
        return;
      }

      const selectedMinutes = timeToMinutes(form.time);
      const startMinutes = timeToMinutes(String(selectedStaff.startTime || "00:00"));
      const endMinutes = timeToMinutes(String(selectedStaff.endTime || "23:59"));
      if (!Number.isFinite(selectedMinutes)) {
        setBookingError("Please select a valid appointment time.");
        return;
      }
      if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && (selectedMinutes < startMinutes || selectedMinutes > endMinutes)) {
        setBookingError(`${selectedStaff.name} works from ${formatTime(String(selectedStaff.startTime))} to ${formatTime(String(selectedStaff.endTime))}.`);
        return;
      }

      const conflict = bookings.some((b) => {
        if (b.bookingType === "walk-in" || b.status === "cancelled") return false;
        if (b.date !== form.date || timeToMinutes(b.time) !== selectedMinutes) return false;
        const sameStaffId = b.staffId !== undefined && String(b.staffId) === String(selectedStaff.id);
        const sameStaffName = !b.staffId && String(b.staff || "").trim().toLowerCase() === String(selectedStaff.name || "").trim().toLowerCase();
        return sameStaffId || sameStaffName;
      });
      if (conflict) {
        setBookingError("This staff member already has an appointment at the selected date and time.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const now = new Date();
      const walkInTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const normalizedStaffId = bookingType === "appointment" && selectedStaff
        ? Number.isFinite(Number(selectedStaff.id)) ? Number(selectedStaff.id) : undefined
        : undefined;
      const bookingData: any = {
        customer: customerName,
        customerPhone: form.phone,
        service: form.service,
        date: form.date,
        time: bookingType === "appointment" ? form.time : walkInTime,
        amount: Number(form.amount) || 0,
        status: bookingType === "walk-in" ? "completed" : "pending",
        bookingType,
        staffId: normalizedStaffId,
        staff: bookingType === "appointment" ? (selectedStaff?.name || "Unknown") : "Walk-in",
      };

      const savedBooking = addGlobalBooking(bookingData);
      if (!savedBooking || !savedBooking.id) {
        throw new Error("The booking could not be created.");
      }

      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Failed to create booking:", error);
      setBookingError(error instanceof Error ? error.message : "Booking failed. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const dates = [...new Set(bookings.map(b => b.date))].sort();
  const filtered = filter === "all" ? bookings : bookings.filter(b => b.status === filter);



  const statusMap: Record<string, string> = { confirmed: "badge-green", pending: "badge-amber", cancelled: "badge-red", completed: "badge-blue" };

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em", margin: 0 }}>Bookings</h1>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>Manage upcoming and past appointments</div>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setBookingType("walk-in"); setShowModal(true); }}>+ New Booking</button>
      </div>

      {/* Quick Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Today", value: bookings.filter(b => b.date === todayStr).length, icon: "📅", color: "#0D9488" },
          { label: "Tomorrow", value: bookings.filter(b => b.date === tomorrowStr).length, icon: "⏰", color: "#8B5CF6" },
          { label: "Confirmed", value: bookings.filter(b => b.status === "confirmed").length, icon: "✅", color: "#10B981" },
          { label: "Pending", value: bookings.filter(b => b.status === "pending").length, icon: "⏳", color: "#F59E0B" },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{s.label}</div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["all", "confirmed", "pending", "completed", "cancelled"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 14px", borderRadius: 8, border: "1px solid",
            borderColor: filter === f ? "var(--primary)" : "var(--border)",
            background: filter === f ? "var(--primary)" : "#fff",
            color: filter === f ? "#fff" : "var(--foreground)",
            fontSize: 13, cursor: "pointer", fontWeight: 500, textTransform: "capitalize"
          }}>{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      {/* Bookings by date */}
      {dates.map(date => {
        const dayBookings = filtered.filter(b => b.date === date);
        if (!dayBookings.length) return null;
        const isToday = date === todayStr;
        const dateLabel = isToday ? "Today" : new Date(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
        return (
          <div key={date} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? "var(--primary)" : "var(--foreground)" }}>{dateLabel}</div>
              {isToday && <span className="badge badge-green" style={{ fontSize: 11 }}>Today</span>}
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{dayBookings.length} bookings</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dayBookings.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)).map(booking => (
                <div key={booking.id} style={{ background: "#fff", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ flexShrink: 0, textAlign: "center", width: 56 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: "var(--primary)" }}>{formatTime(booking.time)}</div>
                  </div>
                  <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{booking.customer}</div>
                      {(() => {
                        const matchedCustomer = customers.find((c) => c.phone && booking.customerPhone && normalizePhone(c.phone) === normalizePhone(booking.customerPhone));
                        return matchedCustomer
                          ? <span className={`badge ${isRepeatCustomer(matchedCustomer, bookings) ? "badge-blue" : "badge-gray"}`} style={{ fontSize: 10 }}>
                              {isRepeatCustomer(matchedCustomer, bookings) ? "Repeat" : "New"}
                            </span>
                          : null;
                      })()}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{booking.service} · {booking.staff}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 15 }}>₹{booking.amount.toLocaleString()}</div>
                  <span className={`badge ${statusMap[booking.status] || "badge-gray"}`} style={{ textTransform: "capitalize" }}>{booking.status}</span>
                  {booking.bookingType !== "walk-in" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {booking.status === "pending" && (
                        <button className="btn-primary" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => updateBookingStatus(booking.id, "confirmed")}>Confirm</button>
                      )}
                      {booking.status === "confirmed" && (
                        <button className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => updateBookingStatus(booking.id, "completed")}>Complete</button>
                      )}
                      {(booking.status === "pending" || booking.status === "confirmed") && (
                        <button className="btn-secondary" style={{ fontSize: 12, padding: "5px 10px", color: "#DC2626", borderColor: "#FEE2E2" }} onClick={() => updateBookingStatus(booking.id, "cancelled")}>Cancel</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>New Booking</h3>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--muted-foreground)", lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Booking Type</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className={bookingType === "walk-in" ? "btn-primary" : "btn-secondary"} style={{ flex: 1 }} onClick={() => { setBookingError(""); setBookingType("walk-in"); }}>Walk-in</button>
                  <button className={bookingType === "appointment" ? "btn-primary" : "btn-secondary"} style={{ flex: 1 }} onClick={() => { setBookingError(""); setBookingType("appointment"); }}>Appointment</button>
                </div>
              </div>

               {[
                { label: "Customer Name", key: "customer", type: "text", placeholder: "e.g. Priya Sharma" },
                { label: "Phone *", key: "phone", type: "text", placeholder: "e.g. 98201 45678" },
                { label: "Amount (₹)", key: "amount", type: "number", placeholder: "e.g. 1500" },
                ...(bookingType === "appointment" ? [
                  { label: "Date", key: "date", type: "date" },
                ] : [])
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>{f.label}</label>
                  <input className="input" type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Service</label>
                <select className="input" value={form.service} onChange={e => setForm(p => ({ ...p, service: e.target.value }))}>
                  {services.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              
              {bookingType === "appointment" && (
                <>
                <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Time</label>
                    <select className="input" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))}>
                    {appointmentTimes.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                    </select>
                </div>
                <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Staff</label>
                    <select className="input" value={form.staffId} onChange={e => setForm(p => ({ ...p, staffId: Number(e.target.value) }))}>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                </>
              )}

              {bookingError && (
                <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontSize: 13, lineHeight: 1.45 }}>
                  {bookingError}
                </div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { setShowModal(false); setBookingError(""); }}>Cancel</button>
                <button className="btn-primary" style={{ flex: 1, opacity: isSaving ? 0.7 : 1 }} onClick={addBooking} disabled={isSaving}>
                  {isSaving ? "Saving..." : `Book ${bookingType === "appointment" ? "Appointment 📅" : "Walk-in 🛍️"}`}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
