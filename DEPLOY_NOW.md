# ReBook — production deployment

## Runtime

ReBook runs the frontend/API on Vercel. The WhatsApp Web worker runs inside a persistent Vercel Sandbox; no Oracle VM and no user-side Node.js process are required.

The Sandbox exposes its worker port through a public domain. ReBook's API proxies all WhatsApp requests to that worker and keeps the worker secret server-side.

## Vercel environment variables

Required:
- APP_BASE_URL
- FRONTEND_BASE_URL
- SUPER_ADMIN_PASSWORD
- ADMIN_SESSION_SECRET
- MASTER_ENCRYPTION_KEY
- CENTRAL_FIREBASE_SERVICE_ACCOUNT_JSON
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET
- RAZORPAY_WEBHOOK_SECRET
- CRON_SECRET
- DEMO_WHATSAPP_PIN=7439
- DEMO_WHATSAPP_SHOP_ID=rebook-demo-test
- WHATSAPP_BRIDGE_SECRET
- AUTOMATION_CALLBACK_SECRET
- WHATSAPP_MAX_SESSIONS=2
- WHATSAPP_MAX_RECIPIENTS=100
- WHATSAPP_MAX_AUTOMATION_RECIPIENTS=150
- WHATSAPP_AUTOMATION_DELAY_MS=2000
- REBOOK_SANDBOX_NAME=rebook-whatsapp-worker
- REBOOK_SANDBOX_PROJECT_ID=prj_DSQLRKITHzL5lBtWruqVZsaGv8D8
- REBOOK_SANDBOX_VCPUS=4
- REBOOK_SANDBOX_TIMEOUT_MS=2700000
- REBOOK_SANDBOX_SNAPSHOT_TTL_MS=1209600000

Do not expose the worker secret or Sandbox auth token to the browser.

## WhatsApp flow

1. Demo or paid shop requests a WhatsApp action from the browser.
2. ReBook API starts/resumes the named Vercel Sandbox.
3. Sandbox installs the pinned whatsapp-web.js worker if needed.
4. Worker starts on port 5001 and exposes health/status/connect/send/blast endpoints.
5. ReBook proxies the response back to the browser.
6. WhatsApp sessions use persistent LocalAuth data inside the Sandbox filesystem.

## Scheduled automation

Daily scheduler eligibility is evaluated server-side. Eligible recipients are split into batches of at most WHATSAPP_MAX_AUTOMATION_RECIPIENTS and persisted as queued automation runs before each batch is submitted.

The Sandbox worker queues additional automation batches for the same shop instead of returning a 409 while a previous batch is still sending.

Each batch has its own callback token. The callback aggregates the whole day's queued/sent/failed state.

## Shop access links

The original private /shop/:shopId/:accessToken link still works. After first load, the access token is moved into sessionStorage and the browser URL is cleaned to /shop/:shopId.

## Smoke tests

- /api/health
- /demo
- Demo PIN 7439
- Connect -> QR appears
- Scan -> Connected
- Reset -> fresh QR
- Create test shop -> payment -> active shop
- Expiry -> frozen shop
- Schedule more than 150 eligible automations -> jobs are batched
