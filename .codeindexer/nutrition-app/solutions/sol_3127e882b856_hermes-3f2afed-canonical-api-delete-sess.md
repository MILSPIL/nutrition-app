---
id: sol_3127e882b856
problem: Hermes 3f2afed canonical API DELETE session leaves raw media in cache/images/api_<sha>.png and state.db-wal; standalone adapter test hid this path.
created_at: "2026-10-24T11:45:14.742395+00:00"
project: nutrition-app
category: troubleshooting
author: Codex
tags: [hermes, privacy, canonical, media-cleanup, single-writer]
---

Use real GatewayRunner plus initialize_gateway_runtime/session authority and actual API adapter in the compatibility gate. Configure one canonical worker per turn with exclusive ownership of the same profile; enable PRAGMA secure_delete=ON on the shared writer before admission and assert API DELETE uses that handle. After durable application commit/cleanup job, native DELETE and worker stop/closed handles, the narrow server/trainer/hermes_privacy.py wrapper checks session/admissions are gone, verifies quiescent checkpoint busy=0 and removes only the staging image whose full SHA256 matches. Never TRUNCATE a serving gateway. Open owned media O_NOFOLLOW|O_NONBLOCK, fstat rejects symlink/FIFO/non-regular objects. Keep cleanup pending on failure. Larger synthetic photo tested via canonical complete/cancel; independent scans of raw/base64 fragments, DB/WAL/SHM/logs found no bytes after cleanup. No upstream patches, no private profile or real model calls.

**Dead end tried:** Standalone APIServerAdapter without session authority passed but did not test canonical media ingress. Native DELETE alone returned200 with two retained files. Opening an untrusted FIFO without O_NONBLOCK hung before fstat.

**Evidence:** docs/evidence/hermes-runtime-gate-2026-10-24.json; scripts/hermes-runtime-probe.py; server/trainer/hermes_privacy.py
