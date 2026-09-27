# WhatsApp Consent Removal / Rebuild Map

## Status

The existing WhatsApp consent-gating implementation has been removed from the active ReBook code paths. This branch keeps outbound WhatsApp sending **disabled** until the replacement consent system is implemented.

## What was removed

| Area | File | Removed logic |
|---|---|---|
| WhatsApp blast audience | `src/pages/Campaigns.tsx` | Removed the `whatsappOptIn` audience filter and consent-only audience copy. |
| Campaign UI | `src/pages/Campaigns.tsx` | Removed the consent confirmation checkbox and consent blocking popup. |
| Customer profile | `src/pages/CustomerProfile.tsx` | Removed the WhatsApp consent card, record-opt-in/opt-out controls, and per-send consent confirmation UI/checks. |
| Customer model | `src/context/AppContext.tsx` | Removed the consent fields `whatsappOptIn`, `whatsappOptInAt`, and `whatsappOptInSource`. |
| Single-message service | `src/services/whatsappBridgeService.ts` | Removed consent confirmation parameters from outbound WhatsApp request payloads. |
| WhatsApp worker | `whatsapp-worker/index.cjs` | Removed the old `assertConsent` / `consentConfirmed` send gate. |
| Scheduled automations | `server/rebook-api.cjs` | Removed the `whatsappOptIn` eligibility filter and consent payload from scheduled WhatsApp batches. |

## Current codebase verification

A repository-wide scan on this branch found no remaining references to:

- `whatsappOptIn`
- `whatsappOptInAt`
- `whatsappOptInSource`
- `consentConfirmed`
- `assertConsent`
- WhatsApp consent confirmation UI/gating text

There is no separate Firestore schema definition containing these fields in the repository. Firestore is schemaless, so any historical fields that may already exist in stored customer documents require a separate data migration when the replacement consent system is rebuilt; this branch does not mutate production data.

## Temporary hard block

All outbound WhatsApp messages converge on `whatsapp-worker/index.cjs` → `sendOne()`.

Until the new consent system is implemented, `sendOne()` now:

1. logs exactly:
   `consent system not yet rebuilt`
2. throws the same message
3. performs **no WhatsApp send**

This blocks both direct single-message sends and blast/automation sends that eventually call `sendOne()`.

The QR/session/connection, campaign queue/progress, scheduling, suppression-list handling, reset, and other WhatsApp infrastructure were not changed by this temporary block.

## Files touched by this branch

- `whatsapp-worker/index.cjs`
- `README_REBOOK_PRODUCTION.md`
- `CONSENT_REMOVED.md`

## Rebuild handoff

The replacement consent system needs to be reintroduced at the common outbound send boundary before `sendOne()` is allowed to call `client.sendMessage()`.
