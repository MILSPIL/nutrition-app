---
id: sol_1355ad4de0ff
problem: SciSense personal Hermes returns model_payload_invalid after real HTTP200 Codex responses. The native SDK consumes SSE even when response Content-Type is absent or different; ModelProof relied solely on the header and discarded unparsed terminal bytes as abandoned.
created_at: "2026-10-26T21:09:32.303399+00:00"
project: nutrition-app
category: troubleshooting
tags: [hermes, codex-oauth, sse, model-verification]
---

Detect SSE framing from a bounded 256-byte prefix in ModelProof.feed, including data:, event:, id:, retry: or comment prefixes. Ordinary/pretty JSON still parses at finish(). Keep the exact raw terminal model, physical POST reservation and deadlines checks. Reproduced red/green with the actual pinned Codex SDK and two-byte headerless fragments; foreign model, missing terminal and real read-error remain rejected. Live deployment validation is recorded separately; do not mistake the shim's echoed model for raw provider proof.
