# ReBook WhatsApp Worker — Oracle Cloud

ReBook production WhatsApp is hosted on a persistent Oracle VM. End users do **not** install Node.js, run npm commands, or keep their computers online for messaging.

Architecture:

```
ReBook browser
   -> Vercel ReBook API
   -> authenticated Oracle WhatsApp worker
   -> whatsapp-web.js + Chromium
   -> WhatsApp Web
```

## Oracle Always Free

Oracle's current Always Free documentation lists **1,500 OCPU hours + 9,000 GB-hours per month** for Ampere A1, equivalent to **2 OCPUs + 12 GB RAM** for an Always Free tenancy. Always Free compute must be provisioned in the tenancy's home region. Oracle also notes that temporary "out of host capacity" can happen. See:
https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## One-time VM setup

Create an Ubuntu ARM VM:

- Shape: VM.Standard.A1.Flex
- 2 OCPUs
- 12 GB RAM
- Public IPv4 enabled

Install Docker:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out/in once after the group change.

Clone the repository:

```bash
git clone https://github.com/ghontur51-bot/rebook.git
cd rebook/whatsapp-worker
```

Create `.env` from the example:

```bash
cp .env.example .env
```

Generate a strong shared secret and put the same value into both the Oracle worker `.env` and the Vercel environment variable.

Start the worker:

```bash
docker compose --env-file .env up -d --build
```

Check locally on the VM:

```bash
curl http://127.0.0.1:5001/api/health
```

## Vercel variables

Add these to the ReBook Vercel project:

```env
WHATSAPP_BRIDGE_BASE_URL=https://YOUR-WORKER-DOMAIN
WHATSAPP_BRIDGE_SECRET=THE_SAME_SECRET_USED_ON_ORACLE
AUTOMATION_CALLBACK_SECRET=YOUR_AUTOMATION_CALLBACK_SECRET
```

For a hardened deployment, expose the worker through HTTPS and use that HTTPS URL instead of a raw IP.

The worker needs the same `AUTOMATION_CALLBACK_SECRET` value as Vercel so the completed scheduled blast can securely report per-recipient success/failure back to ReBook. The secret never reaches browser JavaScript.

The secret stays server-side. The browser only calls ReBook's own API:

```
/api/shop/:shopId/whatsapp/status
/api/shop/:shopId/whatsapp/connect
/api/shop/:shopId/whatsapp/send-single
/api/shop/:shopId/whatsapp/blast
/api/shop/:shopId/whatsapp/blast/progress
/api/shop/:shopId/whatsapp/blast/cancel
/api/shop/:shopId/whatsapp/reset
/api/shop/:shopId/whatsapp/disconnect
```

## QR/pairing flow

For a real shop:

```
/shop/{shopId}/{accessToken}
```

ReBook asks the Oracle worker to start/resume the session for that shop. The worker stores the WhatsApp Web session under its persistent Docker volume. The first connection produces a QR and ReBook displays it. After successful pairing, later worker/VM restarts can restore the saved session.

The public `/demo` route can connect a real WhatsApp account only when the server-side demo PIN is configured.

## Multi-tenant sessions

Each shop gets a separate `whatsapp-web.js` LocalAuth client and its own persistent session directory. The worker defaults to:

```env
WHATSAPP_MAX_SESSIONS=2
```

This is deliberately conservative because Chromium sessions are resource-heavy on a 2-OCPU/12-GB VM. Increase only after measuring real memory/CPU usage.

## Security

- Never commit `whatsapp-worker/.env`.
- Never expose `WHATSAPP_BRIDGE_SECRET` to browser JavaScript.
- Keep the Oracle worker behind authentication.
- Keep the worker data volume persistent.
- Rotate the shared secret if it is exposed.
- Keep customer WhatsApp opt-in/opt-out controls enabled.

## WhatsApp implementation note

This worker uses `whatsapp-web.js`, an unofficial WhatsApp Web client. ReBook therefore treats the worker as a replaceable infrastructure adapter. The application still enforces explicit consent, opt-out suppression and duplicate protection, but WhatsApp can change behavior affecting unofficial clients.

## Demo WhatsApp testing

The public `/demo` route can also use the real Oracle WhatsApp worker for private testing.

Set these **server-side Vercel environment variables**:

```env
DEMO_WHATSAPP_PIN=your-private-test-pin
DEMO_WHATSAPP_SHOP_ID=rebook-demo-test
```

No demo WhatsApp secret is bundled into the browser. On `/demo`, enter the same PIN in the WhatsApp panel. The PIN is kept only in the browser's session storage and is sent to the ReBook API over HTTPS.

The demo worker session is isolated under the `DEMO_WHATSAPP_SHOP_ID` and does not require a real Central shop record.

Disable or remove `DEMO_WHATSAPP_PIN` before opening the public demo to untrusted visitors.
