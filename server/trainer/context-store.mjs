import { join } from "node:path";
import { existsSync } from "node:fs";
import { createHmac, createCipheriv, randomBytes } from "node:crypto";
import {
  privateDirectory,
  privateRead,
  privateWrite,
  privateAppend,
} from "./private-files.mjs";
import { fail, stableJSON } from "./limits.mjs";
// Called only for an explicitly provisioned curated context, never searches a profile.
export function openContextStore(directory, { key, now = Date.now } = {}) {
  privateDirectory(directory);
  if (!Buffer.isBuffer(key) || key.length < 32) fail("trainer_config", 503);
  const file = join(directory, "context.json"),
    journal = join(directory, "context-receipts.jsonl");
  const mac = (v) =>
    createHmac("sha256", key).update(stableJSON(v)).digest("hex");
  const read = () => {
    let value;
    try {
      value = JSON.parse(privateRead(file));
    } catch {
      fail("context_unavailable", 503);
    }
    const { hmac, ...body } = value;
    if (
      hmac !== mac(body) ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0 ||
      typeof body.text !== "string" ||
      Buffer.byteLength(body.text) > 16000 ||
      !body.applied ||
      typeof body.applied !== "object"
    )
      fail("context_invalid", 503);
    return body;
  };
  read();
  return {
    read() {
      const { text, revision } = read();
      return { text, revision };
    },
    commit({ proposalId, baseRevision, text }) {
      if (
        !/^[a-zA-Z0-9-]{16,80}$/.test(proposalId) ||
        typeof text !== "string" ||
        !text.trim() ||
        Buffer.byteLength(text) > 8000 ||
        /data:(image|audio)\//i.test(text)
      )
        fail("invalid_context_proposal");
      const old = read(),
        hash = mac({ proposalId, baseRevision, text });
      if (old.applied[proposalId]) {
        if (old.applied[proposalId] !== hash) fail("context_conflict", 409);
        return { text: old.text, revision: old.revision, replayed: true };
      }
      if (baseRevision !== old.revision) fail("context_conflict", 409);
      // The proposal is an explicit replacement shown as before/after. One encrypted
      // predecessor backup is sufficient for local rollback and never contains a key.
      const iv = randomBytes(12),
        cipher = createCipheriv(
          "aes-256-gcm",
          createHmac("sha256", key).update("context-backup").digest(),
          iv,
        );
      const encrypted = Buffer.concat([
        cipher.update(privateRead(file)),
        cipher.final(),
      ]);
      privateWrite(
        join(directory, "context.previous.enc"),
        JSON.stringify({
          v: 1,
          iv: iv.toString("base64"),
          tag: cipher.getAuthTag().toString("base64"),
          data: encrypted.toString("base64"),
        }),
      );
      const value = {
        revision: old.revision + 1,
        text,
        applied: { ...old.applied, [proposalId]: hash },
      };
      privateWrite(file, JSON.stringify({ ...value, hmac: mac(value) }));
      const check = read();
      if (
        check.applied[proposalId] !== hash ||
        check.revision !== value.revision
      )
        fail("context_unconfirmed", 503);
      privateAppend(
        journal,
        JSON.stringify({
          proposalId,
          revision: check.revision,
          hash,
          at: now(),
        }) + "\n",
      );
      return { text: check.text, revision: check.revision, replayed: false };
    },
  };
}
// Provisioning is a separate operation; runtime refuses missing state. Used with
// synthetic text locally; private cutover requires the later B approval.
export function provisionContext(directory, { text, key }) {
  privateDirectory(directory);
  const file = join(directory, "context.json");
  if (existsSync(file)) fail("context_exists", 409);
  if (
    !Buffer.isBuffer(key) ||
    key.length < 32 ||
    typeof text !== "string" ||
    Buffer.byteLength(text) > 16000
  )
    fail("trainer_config", 503);
  const value = { revision: 0, text, applied: {} };
  privateWrite(
    file,
    JSON.stringify({
      ...value,
      hmac: createHmac("sha256", key).update(stableJSON(value)).digest("hex"),
    }),
  );
}
