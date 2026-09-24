# ReBook — Deploy Now

## 1. Push this folder to GitHub

Do not add `.env` or any Firebase service-account JSON file.

## 2. Import the repository into Vercel

- Framework preset: Vite (or leave auto-detected)
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

## 3. Add these Vercel environment variables

`APP_BASE_URL=https://YOUR-PROJECT.vercel.app`
`FRONTEND_BASE_URL=https://YOUR-PROJECT.vercel.app`
`REBOOK_API_PORT=5000`
`SUPER_ADMIN_PASSWORD=...`
`ADMIN_SESSION_SECRET=...`
`MASTER_ENCRYPTION_KEY=...`
`CENTRAL_FIREBASE_SERVICE_ACCOUNT_JSON=...`
`RAZORPAY_KEY_ID=...`
`RAZORPAY_KEY_SECRET=...`
`RAZORPAY_WEBHOOK_SECRET=...`
`CRON_SECRET=...`
`ALLOW_CLOUD_RESET=false`

Do not set any real secret in client-side Vite variables.

## 4. Deploy

After deployment, open:

- `https://YOUR-PROJECT.vercel.app/`
- `https://YOUR-PROJECT.vercel.app/superadmin`
- `https://YOUR-PROJECT.vercel.app/api/health`

## 5. Razorpay webhook

Set the webhook URL to:

`https://YOUR-PROJECT.vercel.app/api/razorpay/webhook`

Use the same `RAZORPAY_WEBHOOK_SECRET` configured in Vercel.

## 6. Final check

- Create a shop.
- Confirm its generated URL uses the Vercel hostname, not localhost.
- Open the shop URL directly in a fresh browser tab.
- Open the payment URL directly.
- Test Razorpay test-mode payment before using live credentials.
- Confirm `/api/cron/billing` is registered by Vercel.
