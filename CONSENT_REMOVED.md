# WhatsApp Consent Removal

The legacy WhatsApp consent system has been completely removed from the ReBook application on this branch.

There is no replacement consent gate, temporary production safety block, environment-based consent restriction, or consent confirmation requirement in the WhatsApp sending path.

## Removed areas

- Customer model: removed whatsappOptIn, whatsappOptInAt, and whatsappOptInSource.
- Customer profile UI: removed consent status display, opt-in/opt-out controls, per-send consent confirmation, and consent blocking.
- Campaign audience: removed consent-based audience filtering and consent-only campaign text.
- Campaign UI/state: removed consent confirmation state, checkbox, warnings, and opt-in-only labels.
- Single-message API/service: removed consent parameters from browser-to-API WhatsApp requests.
- Scheduled automations: removed consent eligibility filtering, consent payload fields, and consent skip counters.
- WhatsApp worker API: removed assertConsent and consentConfirmed request enforcement.
- Documentation: removed stale statements describing the old consent enforcement layer.

Firestore is schemaless, so this code change removes the application/schema references. It does not rewrite historical customer documents already stored in external Firestore projects.

## WhatsApp sending

WhatsApp sends now follow the existing application flow: valid recipient/customer selection, phone validation, WhatsApp connection state, suppression-list handling, duplicate-send protection, and the existing worker logic. None of those checks are a consent gate.

No temporary consent block remains.

## Chromium / QR fix

The WhatsApp worker now removes stale Chromium singleton lock files before every browser startup:

- SingletonLock
- SingletonSocket
- SingletonCookie

Cleanup is defensive and runs immediately before the worker's Chromium preflight and again before creating the whatsapp-web.js client.

This is intended to prevent Vercel Sandbox filesystem snapshots from carrying stale Chromium ownership markers into a new worker process.

## Files changed for consent removal

- src/context/AppContext.tsx
- src/pages/Campaigns.tsx
- src/pages/CustomerProfile.tsx
- src/services/whatsappBridgeService.ts
- server/rebook-api.cjs
- whatsapp-worker/index.cjs
- README_REBOOK_PRODUCTION.md

## Chromium fix

- whatsapp-worker/index.cjs

## Validation performed

A repository code search on the working branch was run for the old consent identifiers and consent gating text. No matches remain in the indexed repository code.

The branch was created directly from commit 607873674e29ebcc390c29198e98c0cfabfeb6e3 (6078736).

No production deployment, merge, or production alias change was performed.
