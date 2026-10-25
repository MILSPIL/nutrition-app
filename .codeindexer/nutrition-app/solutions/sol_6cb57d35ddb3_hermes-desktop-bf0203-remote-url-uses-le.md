---
id: sol_6cb57d35ddb3
problem: Hermes Desktop bf0203 remote URL uses legacy session payload even when the dashboard is attached to a canonical owner; source desktop/cols/fast are rejected. OAuth registry redial can also drop a negotiated canonical marker.
created_at: "2026-10-25T20:51:00.199497+00:00"
project: nutrition-app
category: troubleshooting
tags: [hermes, canonical-remote, desktop, oauth-redial]
---

Use the existing CanonicalDesktopProtocol with an authenticated target-negotiated hermes_canonical marker; leave standard remote auth and native private tickets unchanged. Preserve the marker on both primary OAuth refresh and createRegistryGatewayWsUrlHandler before profile/exact-header binding. Pinned extension: server/trainer/desktop/hermes-bf0203-canonical-remote.patch. 25 codec/socket cases and isolated Light build pass; actual native/Electron E2E and target bridge+pin checks remain separate. docs/evidence/hermes-personal-desktop-codec-2026-10-25.json.
