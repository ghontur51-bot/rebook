# ReBook production foundation

This version adds a central Super Admin, per-shop Firebase/Firestore storage through server-side Firebase service-account access, Razorpay 30-day billing, automatic expiry/freeze, automatic renewal QR generation, and a protected shop API. The existing WhatsApp bridge remains separate in `server/whatsapp-bridge.cjs`.

## Local development

Run three processes:

```bash
npm run dev
npm run api
npm run wa-bridge
```

Frontend: Vite (default port 8443)
API: ReBook API (default port 5000)
WhatsApp bridge: existing local bridge (default port 5001)

## Central Firebase

Create one private Firebase project for ReBook control metadata. Enable Cloud Firestore. Create a server-side service account with access to that project and place its JSON in `CENTRAL_FIREBASE_SERVICE_ACCOUNT_JSON`. Keep the private key only in server environment variables / secret storage.

## Shop Firebase

For every real shop, the owner can use their own Firebase project. In that project:
1. Enable Cloud Firestore.
2. Create a service account with Firestore/Datastore access.
3. Create a JSON key for that service account.
4. Register a Web App and copy its Firebase Web App Config.

In ReBook Super Admin, paste both the Web App Config and the Service Account JSON. The backend encrypts the service-account JSON before storing it in the central control database. The app never puts the private key in browser code.

Because ReBook uses its backend as the Firestore gateway, the shop's Firestore client rules can be locked down separately; the backend accesses Firestore using the shop service account.

## Billing

- Price is saved once per shop.
- A shop starts in `pending` until the first payment is verified.
- Payment verification uses Razorpay signature + captured-payment checks.
- The active period is 30 days from the verified payment time.
- On expiry, the shop becomes `frozen`; customer/business data is not deleted.
- One unpaid renewal cycle can have one active renewal request/QR.
- The renewal QR points to the ReBook billing page and the billing page creates the current Razorpay order.
- Vercel Cron calls `/api/cron/billing` hourly in production; opening the shop also checks expiry immediately, so a delayed scheduler does not permanently leave an expired shop unlocked.


## Vercel SPA routing

`vercel.json` includes rewrites for `/superadmin`, `/shop/:path*`, and `/pay/:path*` to `index.html` so direct visits to React client-side routes work on Vercel. The `/api/*` routes remain handled by the Vercel Function in `api/index.cjs`.

## Vercel environment variables

After the first deployment, set `APP_BASE_URL` to the exact production Vercel URL (for example `https://your-project.vercel.app`) and redeploy. Keep secrets server-side only. `REBOOK_API_URL` is used by the local Vite dev proxy; production browser requests use the same-origin `/api` paths.

## Production secrets

Do not commit `.env` or any service-account JSON. Put the following into Vercel/Cloud Run/GCP secret storage:

- `SUPER_ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `MASTER_ENCRYPTION_KEY`
- `CENTRAL_FIREBASE_SERVICE_ACCOUNT_JSON`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `CRON_SECRET`

## URLs

The app uses these paths on the same frontend deployment:

- `/` = demo/local shop
- `/superadmin` = password-protected central admin
- `/shop/:shopId/:accessToken` = real shop app
- `/pay/:shopId/:cycleId` = billing page
- `/api/cron/billing` = expiry worker

For Vercel, you can use the deployment's default `vercel.app` hostname; set `APP_BASE_URL` to that exact production URL so generated QR codes always point to the deployed app.

## Data safety

The demo shop continues to use the existing seed/localStorage path. Real shops use Firestore through the API. The `DELETE /api/admin/shops/:shopId` action only disables ReBook access and does not delete the external shop Firebase project or its data.

`ALLOW_CLOUD_RESET=false` by default so the existing factory-reset control cannot wipe a real shop cloud database accidentally.

## Firebase service-account OAuth troubleshooting

If shop creation reaches `Google authentication failed (400)`, the JSON and PEM may already be syntactically valid; Google is rejecting the signed service-account assertion. Use the complete JSON downloaded from Firebase -> Project settings -> Service accounts -> Generate new private key. Do not mix `client_email` from one key with `private_key` from another. On Windows, also ensure Date & time is set automatically and synced, because the JWT `iat`/`exp` values are time-sensitive. The API now returns Google's `error` and `error_description` in the failure message so the exact cause can be identified.
