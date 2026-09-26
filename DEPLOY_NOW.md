# ReBook — deploy checklist

## 1. GitHub
Keep secrets outside the repository. Do not commit `.env`, Firebase service-account JSON files, or payment secrets.

## 2. Vercel environment variables

Server secrets:
- APP_BASE_URL=https://YOUR-VERCEL-DOMAIN
- FRONTEND_BASE_URL=https://YOUR-VERCEL-DOMAIN
- SUPER_ADMIN_PASSWORD=...
- ADMIN_SESSION_SECRET=...
- MASTER_ENCRYPTION_KEY=...
- CENTRAL_FIREBASE_SERVICE_ACCOUNT_JSON=...
- RAZORPAY_KEY_ID=...
- RAZORPAY_KEY_SECRET=...
- RAZORPAY_WEBHOOK_SECRET=...
- CRON_SECRET=...
- ALLOW_CLOUD_RESET=false

Public site configuration:
- VITE_LEGAL_BUSINESS_NAME=YOUR_REAL_LEGAL_BUSINESS_NAME
- VITE_SUPPORT_EMAIL=YOUR_REAL_SUPPORT_EMAIL
- VITE_SUPPORT_PHONE=YOUR_REAL_SUPPORT_PHONE
- VITE_BUSINESS_ADDRESS=YOUR_REAL_BUSINESS_ADDRESS

`REBOOK_API_URL` is used for local Vite proxying and is not required by the production browser app.

## 3. Public compliance pages

The production site includes:
- /
- /about
- /pricing
- /contact
- /terms
- /privacy-policy
- /refund-policy
- /security

Before payment-gateway review, replace the public site placeholders with real business/contact information and review the legal text for your actual business and applicable law.

## 4. Razorpay

Webhook:
https://YOUR-VERCEL-DOMAIN/api/razorpay/webhook

Use the Razorpay credentials for the ReBook merchant account, not credentials belonging to another business.

## 5. Smoke tests

- /api/health -> {"ok":true,"service":"rebook-api"}
- /superadmin -> admin login
- / -> public ReBook SaaS site
- /pricing, /contact, /terms, /privacy-policy, /refund-policy
- create a test shop
- verify a test payment
- confirm paid shop access
- confirm expired/frozen behavior

## 6. Important security

Rotate any Firebase service-account key that was exposed during development. Keep the replacement key only in the appropriate server-side environment variable.


## WhatsApp bridge note

The current WhatsApp feature is a local whatsapp-web.js bridge. It requires the operator computer to remain online with the linked WhatsApp Web session available. The bridge now requires explicit customer opt-in, records STOP-style opt-outs locally, validates WhatsApp registration, blocks recent duplicates, and refuses fake simulator sends.

The bridge is not Meta's official WhatsApp Business Platform. whatsapp-web.js's own project documentation notes that unofficial clients are not guaranteed safe from blocking. For a true multi-tenant production messaging product, migrate the WhatsApp channel to the official WhatsApp Business Platform/Cloud API.


<!-- CI validation marker 2 -->
