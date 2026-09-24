export const normalizePhoneNumber = (phone: string): string => {
  return phone.replace(/\D/g, "").slice(-10);
};

export const staff = [
  { id: 1, name: "Sonal", phone: "+91 98765 43210", template: "Hi {assistant}, here is your work for {date}:\n{work}\nTotal: {count} bookings", active: true, workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], startTime: "09:00", endTime: "18:00" },
  { id: 2, name: "Rupa", phone: "+91 98765 43211", template: "Hi {assistant}, here is your work for {date}:\n{work}\nTotal: {count} bookings", active: true, workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], startTime: "09:00", endTime: "18:00" },
  { id: 3, name: "Meena", phone: "+91 98765 43212", template: "Hi {assistant}, here is your work for {date}:\n{work}\nTotal: {count} bookings", active: true, workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], startTime: "09:00", endTime: "18:00" },
  { id: 4, name: "Divya", phone: "+91 98765 43213", template: "Hi {assistant}, here is your work for {date}:\n{work}\nTotal: {count} bookings", active: true, workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], startTime: "09:00", endTime: "18:00" },
];

export const customers = [
  { id: 1, name: "Priya Sharma", phone: "+91 98201 45678", email: "priya.sharma@gmail.com", status: "active", lastVisit: "2026-09-05", totalVisits: 24, totalSpend: 18600, favouriteService: "Hair Colour & Highlights", tags: ["VIP", "Regular"], notes: "Prefers Loreal products. Allergic to ammonia-based dyes.", avatar: "PS" },
  { id: 2, name: "Ananya Mehta", phone: "+91 99304 12345", email: "ananya.mehta@yahoo.com", status: "inactive", lastVisit: "2026-06-12", totalVisits: 8, totalSpend: 5400, favouriteService: "Keratin Treatment", tags: ["Lapsed"], notes: "Moved to Bandra area. Might not come back regularly.", avatar: "AM" },
  { id: 3, name: "Sunita Rao", phone: "+91 97112 67890", email: "sunita.rao@gmail.com", status: "won_back", lastVisit: "2026-09-10", totalVisits: 15, totalSpend: 11200, favouriteService: "Facial & Cleanup", tags: ["Won Back", "Regular"], notes: "Loves the signature facial. Birthday in December.", avatar: "SR" },
  { id: 4, name: "Deepika Nair", phone: "+91 98765 43210", email: "deepika.n@hotmail.com", status: "inactive", lastVisit: "2026-05-20", totalVisits: 5, totalSpend: 3200, favouriteService: "Manicure & Pedicure", tags: ["At Risk"], notes: "", avatar: "DN" },
  { id: 5, name: "Kavita Joshi", phone: "+91 96321 54321", email: "kavita.joshi@gmail.com", status: "active", lastVisit: "2026-09-01", totalVisits: 31, totalSpend: 28400, favouriteService: "Bridal Package", tags: ["VIP", "High Value"], notes: "Event planner. Refers 2-3 clients monthly.", avatar: "KJ" },
  { id: 6, name: "Ritu Bansal", phone: "+91 99201 87654", email: "ritu.b@gmail.com", status: "inactive", lastVisit: "2026-06-30", totalVisits: 11, totalSpend: 7800, favouriteService: "Blow Dry & Styling", tags: ["Lapsed"], notes: "Prefers evening appointments.", avatar: "RB" },
  { id: 7, name: "Meena Kulkarni", phone: "+91 98451 23456", email: "meena.k@rediffmail.com", status: "won_back", lastVisit: "2026-08-28", totalVisits: 19, totalSpend: 14500, favouriteService: "Hair Spa", tags: ["Won Back"], notes: "Responded to 60-day win-back campaign.", avatar: "MK" },
  { id: 8, name: "Anjali Verma", phone: "+91 97654 34567", email: "anjali.v@gmail.com", status: "active", lastVisit: "2026-09-08", totalVisits: 7, totalSpend: 4900, favouriteService: "Threading & Waxing", tags: ["New"], notes: "New customer. Referred by Kavita Joshi.", avatar: "AV" },
  { id: 9, name: "Pooja Agarwal", phone: "+91 96543 45678", email: "pooja.agarwal@gmail.com", status: "inactive", lastVisit: "2026-04-15", totalVisits: 3, totalSpend: 1800, favouriteService: "Basic Facial", tags: ["At Risk", "Churned"], notes: "", avatar: "PA" },
  { id: 10, name: "Shreya Pandey", phone: "+91 98901 56789", email: "shreya.p@gmail.com", status: "active", lastVisit: "2026-09-11", totalVisits: 22, totalSpend: 17300, favouriteService: "Hair Colour & Highlights", tags: ["Regular", "VIP"], notes: "Monthly visit. Loves balayage.", avatar: "SP" },
  { id: 11, name: "Divya Shetty", phone: "+91 97890 67890", email: "divya.s@gmail.com", status: "inactive", lastVisit: "2026-07-01", totalVisits: 6, totalSpend: 4200, favouriteService: "Nail Art", tags: ["Lapsed"], notes: "Does nail art orders for events.", avatar: "DS" },
  { id: 12, name: "Nidhi Kapoor", phone: "+91 99123 78901", email: "nidhi.k@gmail.com", status: "won_back", lastVisit: "2026-09-03", totalVisits: 12, totalSpend: 9600, favouriteService: "Keratin Treatment", tags: ["Won Back", "Regular"], notes: "Came back after 45-day message.", avatar: "NK" },
];

export const visitHistory = {
  1: [
    { date: "2026-09-05", service: "Hair Colour & Highlights", amount: 2800, staff: "Sonal" },
    { date: "2026-08-10", service: "Blow Dry & Styling", amount: 600, staff: "Rupa" },
    { date: "2026-07-14", service: "Hair Colour & Highlights", amount: 2800, staff: "Sonal" },
    { date: "2026-06-20", service: "Hair Spa", amount: 1200, staff: "Sonal" },
    { date: "2026-05-18", service: "Facial & Cleanup", amount: 1500, staff: "Meena" },
  ],
  3: [
    { date: "2026-09-10", service: "Facial & Cleanup", amount: 1500, staff: "Meena" },
    { date: "2026-08-15", service: "Threading & Waxing", amount: 700, staff: "Rupa" },
    { date: "2026-07-20", service: "Facial & Cleanup", amount: 1500, staff: "Meena" },
  ],
};

export const automations = [
  { id: 1, name: "60-Day Win-Back", trigger: "No visit for 60 days", action: "Send WhatsApp message", message: "Hi {name}! We miss you at Glam Studio 💖 It's been a while since your last visit. Come back this week and get 15% off on any service. Book now: glam.studio/book", status: "active", triggered: 0, converted: 0, conversionRate: 0 },
  { id: 2, name: "30-Day Gentle Nudge", trigger: "No visit for 30 days", action: "Send SMS", message: "Hey {name}, it's been 30 days since your last visit at Glam Studio. How about treating yourself? Book your favourite service today!", status: "active", triggered: 0, converted: 0, conversionRate: 0 },
  { id: 3, name: "Birthday Offer", trigger: "7 days before birthday", action: "Send WhatsApp message", message: "Happy Birthday {name}! 🎂 Celebrate with a special 20% discount on your birthday month at Glam Studio. You deserve to feel fabulous!", status: "active", triggered: 0, converted: 0, conversionRate: 0 },
  { id: 4, name: "Post-Visit Thank You", trigger: "1 day after visit", action: "Send WhatsApp message", message: "Thank you for visiting Glam Studio, {name}! We hope you loved your experience. Leave us a review and get ₹100 off your next visit 🌟", status: "active", triggered: 0, converted: 0, conversionRate: 0 },
  { id: 5, name: "90-Day Last Chance", trigger: "No visit for 90 days", action: "Send WhatsApp message", message: "We haven't seen you in 3 months, {name}! Here's a special 25% discount just for you. This offer expires in 48 hours. Don't miss out!", status: "inactive", triggered: 0, converted: 0, conversionRate: 0 },
];

export const campaigns = [
  { id: 1, name: "Festive Season Offer", audience: "All Active Customers", sent: 234, opened: 189, converted: 67, status: "completed", date: "2026-08-28", channel: "WhatsApp" },
  { id: 2, name: "Monsoon Hair Care", audience: "Inactive (30-60 days)", sent: 89, opened: 71, converted: 22, status: "completed", date: "2026-07-15", channel: "SMS" },
  { id: 3, name: "Navratri Special", audience: "VIP Customers", sent: 45, opened: 40, converted: 31, status: "scheduled", date: "2026-10-02", channel: "WhatsApp" },
  { id: 4, name: "New Service Launch", audience: "All Customers", sent: 0, opened: 0, converted: 0, status: "draft", date: "2026-09-20", channel: "WhatsApp" },
];

export const bookings = [
  { id: 1, customer: "Priya Sharma", customerId: 1, customerPhone: "+91 98201 45678", service: "Hair Colour & Highlights", date: "2026-09-13", time: "11:00 AM", staff: "Sonal", amount: 2800, status: "confirmed", bookingType: "appointment" },
  { id: 2, customer: "Kavita Joshi", customerId: 5, customerPhone: "+91 96321 54321", service: "Bridal Consultation", date: "2026-09-13", time: "2:00 PM", staff: "Rupa", amount: 500, status: "confirmed", bookingType: "appointment" },
  { id: 3, customer: "Anjali Verma", customerId: 8, customerPhone: "+91 97654 34567", service: "Threading & Waxing", date: "2026-09-13", time: "4:30 PM", staff: "Meena", amount: 700, status: "pending", bookingType: "appointment" },
  { id: 4, customer: "Shreya Pandey", customerId: 10, customerPhone: "+91 98901 56789", service: "Balayage", date: "2026-09-14", time: "10:00 AM", staff: "Sonal", amount: 4500, status: "confirmed", bookingType: "appointment" },
  { id: 5, customer: "Nidhi Kapoor", customerId: 12, customerPhone: "+91 99123 78901", service: "Keratin Treatment", date: "2026-09-14", time: "1:00 PM", staff: "Rupa", amount: 3200, status: "confirmed", bookingType: "appointment" },
  { id: 6, customer: "Meena Kulkarni", customerId: 7, customerPhone: "+91 98451 23456", service: "Hair Spa", date: "2026-09-15", time: "11:30 AM", staff: "Sonal", amount: 1200, status: "pending", bookingType: "appointment" },
];

export const analyticsData = {
  monthly: [
    { month: "Apr", contacted: 45, returned: 8, revenue: 4200 },
    { month: "May", contacted: 62, returned: 14, revenue: 7800 },
    { month: "Jun", contacted: 78, returned: 19, revenue: 10500 },
    { month: "Jul", contacted: 95, returned: 24, revenue: 13200 },
    { month: "Aug", contacted: 112, returned: 31, revenue: 17400 },
    { month: "Sep", contacted: 89, returned: 27, revenue: 14900 },
  ],
  conversionByChannel: [
    { channel: "WhatsApp", rate: 28.4, color: "#25D366" },
    { channel: "SMS", rate: 18.2, color: "#3B82F6" },
    { channel: "Email", rate: 12.8, color: "#F59E0B" },
  ],
};
