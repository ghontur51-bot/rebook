# ReBook production foundation

ReBook is a multi-tenant salon SaaS with:
- Vercel frontend + API
- per-shop Firebase/Firestore storage
- central Firebase control/billing metadata
- Razorpay 30-day billing
- server-side scheduled automations
- persistent Vercel Sandbox WhatsApp Web runtime

## WhatsApp runtime

The WhatsApp worker is the code under whatsapp-worker/. Vercel Sandbox starts it on demand in an isolated microVM and persists its filesystem for future resumes.

There is no Oracle VM and no local npm run wa-bridge step in the production flow.

The browser talks only to ReBook's Vercel API:
- /api/demo/whatsapp/*
- /api/shop/:shopId/whatsapp/*

## Local development

Run the frontend and API:

    npm install
    npm run dev
    npm run api

The WhatsApp Sandbox runtime is intended for Vercel deployment. Local-only WhatsApp development should use an explicit Vercel Sandbox token/config rather than starting a local bridge.

## Billing

- Shops start pending until a Razorpay payment is verified.
- Verified payments activate 30-day billing cycles.
- Expired shops become frozen without deleting their business data.
- Renewal payment links use the central billing flow.

## Data isolation

Each real shop can use its own Firebase project. The backend stores encrypted service-account credentials centrally and acts as the Firestore gateway.

## Security

- Demo WhatsApp access is server-validated and currently uses PIN 7439.
- Real shops use server-validated shop access tokens.
- Customer messaging requires explicit WhatsApp opt-in.
- Worker requests use a server-only bearer secret.
- Scheduled automation callbacks use a separate server-only callback secret.
- Do not commit .env, service-account JSON, or private keys.

## Important WhatsApp limitation

whatsapp-web.js is an unofficial WhatsApp Web client, not Meta's official WhatsApp Business Platform. ReBook should treat Sandbox availability and WhatsApp session stability as operational dependencies and provide reset/reconnect controls.
