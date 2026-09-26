import React from "react";
import { siteConfig } from "../siteConfig";

const linkStyle: React.CSSProperties = { color: "inherit", textDecoration: "none" };

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #e2e8f0", background: "#fff" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 28 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>ReBook</div>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>{siteConfig.description}</p>
        </div>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Company</div>
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <a href="/about" style={linkStyle}>About</a>
            <a href="/contact" style={linkStyle}>Contact</a>
            <a href="/pricing" style={linkStyle}>Pricing</a>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Legal</div>
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <a href="/terms" style={linkStyle}>Terms of Service</a>
            <a href="/privacy-policy" style={linkStyle}>Privacy Policy</a>
            <a href="/refund-policy" style={linkStyle}>Refund & Cancellation</a>
            <a href="/security" style={linkStyle}>Security</a>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px 24px", color: "#64748b", fontSize: 12 }}>
        © {(new Date()).getFullYear()} {siteConfig.legalBusinessName}. All rights reserved.
      </div>
    </footer>
  );
}

function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a" }}>
      <header style={{ borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 }}>
          <a href="/" style={{ ...linkStyle, fontWeight: 900, fontSize: 20 }}>ReBook</a>
          <nav style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#475569" }}>
            <a href="/pricing" style={linkStyle}>Pricing</a>
            <a href="/about" style={linkStyle}>About</a>
            <a href="/contact" style={linkStyle}>Contact</a>
            <a href="/terms" style={linkStyle}>Terms</a>
            <a href="/privacy-policy" style={linkStyle}>Privacy</a>
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "56px 24px 72px" }}>
        <div style={{ fontSize: 12, color: "#0f766e", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2 }}>ReBook · {title}</div>
        <h1 style={{ fontSize: 42, lineHeight: 1.08, margin: "12px 0 20px", letterSpacing: -1.5 }}>{title}</h1>
        {children}
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontSize: 21, marginBottom: 10 }}>{title}</h2>
      <div style={{ color: "#475569", lineHeight: 1.8, fontSize: 14 }}>{children}</div>
    </section>
  );
}

function Info({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div style={{ padding: 18, borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>
        {href ? <a href={href} style={{ color: "#0f766e", textDecoration: "none" }}>{value}</a> : value}
      </div>
    </div>
  );
}

export function PublicHome() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
          <a href="/" style={{ ...linkStyle, fontSize: 21, fontWeight: 900 }}>ReBook</a>
          <nav style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#475569" }}>
            <a href="/pricing" style={linkStyle}>Pricing</a>
            <a href="/about" style={linkStyle}>About</a>
            <a href="/contact" style={linkStyle}>Contact</a>
            <a href="/superadmin" style={{ ...linkStyle, fontWeight: 800 }}>Admin</a>
          </nav>
        </div>
      </header>

      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "84px 24px 60px", display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 42, alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-flex", padding: "8px 12px", borderRadius: 999, background: "#ccfbf1", color: "#115e59", fontSize: 12, fontWeight: 800 }}>Salon operations + retention SaaS</div>
          <h1 style={{ fontSize: 64, lineHeight: 1.02, letterSpacing: -2.5, margin: "18px 0 18px" }}>Run the salon. Build the relationship.</h1>
          <p style={{ fontSize: 18, lineHeight: 1.7, color: "#475569", maxWidth: 680 }}>
            ReBook brings customer management, appointments, staff operations, follow-ups, campaigns and business analytics into one cloud workspace for growing salons.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 26 }}>
            <a href="/contact" className="btn-primary" style={{ ...linkStyle, display: "inline-block", padding: "12px 18px", borderRadius: 10 }}>Talk to ReBook</a>
            <a href="/pricing" style={{ ...linkStyle, display: "inline-block", padding: "12px 18px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff" }}>View pricing</a>
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: "#64748b" }}>30-day subscription billing · Secure online checkout · Cloud-based business data</div>
        </div>
        <div style={{ background: "#0f172a", color: "#fff", borderRadius: 22, padding: 26, boxShadow: "0 24px 70px rgba(15, 23, 42, .15)" }}>
          <div style={{ fontSize: 12, color: "#99f6e4", fontWeight: 800 }}>WHAT REBOOK COVERS</div>
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {["Customer profiles and phone-based identity", "Appointments, staff and working hours", "Retention automations and campaigns", "Business analytics and recovered revenue", "Cloud data isolation for each shop"].map((item) => (
              <div key={item} style={{ padding: 14, border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, background: "rgba(255,255,255,.05)" }}>{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "60px 24px" }}>
          <div style={{ fontSize: 13, color: "#0f766e", fontWeight: 800 }}>A SaaS workflow, not a one-off website</div>
          <h2 style={{ fontSize: 34, margin: "10px 0 28px" }}>Everything in one operational workspace.</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              ["Customers", "Keep customer history, visits, spend and phone identity organized."],
              ["Bookings", "Manage walk-ins, appointments, staff schedules and booking checks."],
              ["Retention", "Create follow-up automations and campaign workflows for returning customers."],
              ["Staff", "Keep staff records, working hours and day-to-day duties together."],
              ["Analytics", "Understand revenue, retention, inactive customers and recovered business."],
              ["Cloud", "Each connected shop can use its own Firebase/Firestore project."],
            ].map(([title, text]) => (
              <div key={title} style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 16, background: "#f8fafc" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
                <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.65 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "60px 24px" }}>
        <h2 style={{ fontSize: 34, margin: 0 }}>Simple subscription model</h2>
        <p style={{ color: "#64748b", lineHeight: 1.7, maxWidth: 720 }}>
          ReBook uses 30-day subscription cycles. The applicable amount is shown before payment and stored for future renewals. Payments are processed through Razorpay; ReBook does not store payment-card credentials.
        </p>
        <a href="/pricing" style={{ ...linkStyle, display: "inline-block", marginTop: 12, fontWeight: 800, color: "#0f766e" }}>See billing details →</a>
      </section>

      <Footer />
    </div>
  );
}

export function About() {
  return (
    <Layout title="About ReBook">
      <p style={{ fontSize: 17, color: "#475569", lineHeight: 1.8 }}>
        ReBook is software for salons that want one place to manage customer relationships, bookings, staff workflows, retention activity and business reporting.
      </p>
      <Section title="What ReBook provides"><p>ReBook is delivered as a cloud-based subscription service. Each connected shop can have its own business dataset, while ReBook Central manages shop access and subscription state.</p></Section>
      <Section title="Who it is for"><p>ReBook is designed for salons and similar appointment-based beauty businesses that need customer records, scheduling, staff coordination and retention workflows in a single operational system.</p></Section>
      <Section title="Business information">
        <p><strong>Legal business name:</strong> {siteConfig.legalBusinessName}</p>
        <p><strong>Address:</strong> {siteConfig.businessAddress || "Not configured"}</p>
        <p><strong>Support:</strong> {siteConfig.supportEmail || "Not configured"}</p>
      </Section>
    </Layout>
  );
}

export function Contact() {
  return (
    <Layout title="Contact ReBook">
      <p style={{ color: "#475569", lineHeight: 1.8 }}>Need help with setup, subscription, billing or your ReBook account? Use the support details configured for the ReBook service.</p>
      <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
        <Info label="Support email" value={siteConfig.supportEmail || "Not configured"} href={siteConfig.supportEmail ? "mailto:" + siteConfig.supportEmail : undefined} />
        <Info label="Support phone" value={siteConfig.supportPhone || "Not configured"} />
        <Info label="Business address" value={siteConfig.businessAddress || "Not configured"} />
      </div>
      <div style={{ marginTop: 26, padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
        Configure the real legal business name, support contact and business address before submitting the website for payment-gateway verification.
      </div>
    </Layout>
  );
}

export function Pricing() {
  return (
    <Layout title="Pricing">
      <div style={{ padding: 24, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 18 }}>
        <div style={{ fontSize: 13, color: "#0f766e", fontWeight: 800 }}>30-DAY SUBSCRIPTION</div>
        <div style={{ fontSize: 42, fontWeight: 900, marginTop: 8 }}>Price shown at checkout</div>
        <p style={{ color: "#64748b", lineHeight: 1.8 }}>ReBook subscriptions are configured per connected shop. The exact 30-day amount is shown on the payment page before you authorize payment.</p>
        <div style={{ marginTop: 18, display: "grid", gap: 10, color: "#334155" }}>
          <div>✓ Access to the connected ReBook workspace during the paid term</div>
          <div>✓ Customer, booking, staff and analytics modules</div>
          <div>✓ Retention automations and campaign tools</div>
          <div>✓ Cloud business-data persistence for the connected shop</div>
        </div>
      </div>
      <Section title="Billing"><p>Subscriptions are issued in 30-day cycles. Renewal pricing uses the shop's stored subscription price unless the subscription terms are changed before a future cycle.</p></Section>
      <Section title="Payment processor"><p>Payments are processed through Razorpay. ReBook does not store customers' card numbers, CVV values or other payment-instrument credentials.</p></Section>
    </Layout>
  );
}

export function Terms() {
  return (
    <Layout title="Terms of Service">
      <p><strong>Effective date:</strong> September 25, 2026</p>
      <Section title="1. Service"><p>ReBook is a software-as-a-service platform for salons and related appointment-based businesses. Access is provided for the subscription term purchased for the connected shop.</p></Section>
      <Section title="2. Accounts and access"><p>Customers are responsible for the credentials, access links and information they use to access ReBook. Customers must use the service only for lawful business purposes and must not attempt to bypass access controls or interfere with the service.</p></Section>
      <Section title="3. Subscriptions and payment"><p>Subscriptions are billed in 30-day cycles. The applicable price is displayed before payment. Access may be suspended or frozen after the paid period ends until a renewal payment is successfully verified.</p></Section>
      <Section title="4. Customer data"><p>Customers remain responsible for the accuracy and lawfulness of the business data they enter into ReBook. ReBook processes business and personal data only as needed to provide the service, support the account, maintain security and comply with applicable law.</p></Section>
      <Section title="5. Acceptable use"><p>You must not use ReBook for unlawful activity, fraud, abuse, unauthorized messaging, or any activity that could harm other users, third parties or the service.</p></Section>
      <Section title="6. Availability"><p>We aim to keep ReBook available and reliable, but no online service can guarantee uninterrupted availability. We may perform maintenance, security updates or service changes when reasonably necessary.</p></Section>
      <Section title="7. Termination"><p>We may suspend or terminate access for non-payment, material breach, abuse, fraud or legal/compliance requirements. Where possible, business data will be preserved according to the service's retention and storage practices.</p></Section>
      <Section title="8. Contact"><p>For questions about these terms, use the contact details on the Contact page.</p></Section>
    </Layout>
  );
}

export function Privacy() {
  return (
    <Layout title="Privacy Policy">
      <p><strong>Effective date:</strong> September 25, 2026</p>
      <Section title="1. Information handled"><p>ReBook may process account information, shop details, customer names and phone numbers, booking information, staff information, automation settings and operational analytics needed to provide the service.</p></Section>
      <Section title="2. Payment information"><p>Payments are handled by Razorpay. ReBook does not store full card credentials or CVV data on its own servers.</p></Section>
      <Section title="3. Storage"><p>Connected shop business data is stored using the shop's configured Firebase/Firestore project. ReBook Central separately stores shop-management and subscription metadata.</p></Section>
      <Section title="4. How data is used"><p>Data is used to operate the service, provide customer support, maintain security, process subscription payments, generate operational reports and comply with legal obligations.</p></Section>
      <Section title="5. Service providers"><p>ReBook may rely on infrastructure and payment providers, including Firebase/Google Cloud, Vercel and Razorpay, to operate the service. These providers process data under their own applicable terms and privacy policies.</p></Section>
      <Section title="6. Retention and deletion"><p>We retain information for as long as needed to provide the service, comply with legal obligations, resolve disputes and maintain legitimate business records. Customers can contact ReBook to request information about applicable deletion or retention processes.</p></Section>
      <Section title="7. Contact"><p>For privacy questions or requests, use the support details published on the Contact page.</p></Section>
    </Layout>
  );
}

export function RefundPolicy() {
  return (
    <Layout title="Refund & Cancellation Policy">
      <p><strong>Effective date:</strong> September 25, 2026</p>
      <Section title="Subscription cancellation"><p>A subscription can be allowed to lapse without renewal. Cancelling a future renewal does not automatically cancel or refund an already-paid active subscription term.</p></Section>
      <Section title="Refunds"><p>Refund requests are reviewed for duplicate or erroneous charges, failed activation, or situations where ReBook could not reasonably provide the purchased service. Requests should be made as soon as possible using the Contact page and should include transaction details.</p></Section>
      <Section title="Non-use"><p>Unused time during an otherwise successfully activated subscription is not automatically refundable unless ReBook agrees otherwise or applicable law requires it.</p></Section>
      <Section title="Payment disputes"><p>Where a payment dispute, chargeback or reversal is raised, ReBook may temporarily restrict access while the transaction is investigated.</p></Section>
    </Layout>
  );
}

export function Security() {
  return (
    <Layout title="Security">
      <p style={{ color: "#475569", lineHeight: 1.8 }}>ReBook is designed so the browser does not directly write to a shop's Firestore database. Shop credentials are kept server-side and encrypted before storage in the ReBook Central system.</p>
      <Section title="Data isolation"><p>Each real shop can use its own Firebase/Firestore project, while ReBook Central stores control and subscription metadata separately.</p></Section>
      <Section title="Payment security"><p>ReBook delegates payment collection to Razorpay and verifies payment signatures and captured-payment details server-side.</p></Section>
      <Section title="Responsible disclosure"><p>If you believe you have found a security issue, contact ReBook through the published support address and provide enough detail for safe investigation.</p></Section>
    </Layout>
  );
}
