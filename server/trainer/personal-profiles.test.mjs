import test from "node:test";
import assert from "node:assert/strict";
import { personalProfiles } from "./personal-profiles.mjs";

export const fixtureProfiles = () => ({ version: 1, fundingOwner: "owner", profiles: [
  { uid: "owner", profileId: "personal-owner", home: "/var/lib/scisense/personal/owner", socket: "/run/scisense-owner/native.sock", sessionId: "session-owner" },
  { uid: "wife", profileId: "personal-wife", home: "/var/lib/scisense/personal/wife", socket: "/run/scisense-wife/native.sock", sessionId: "session-wife" },
] });

test("verified UID selects one immutable profile; no email, unknown UID or client route fallback", () => {
  const config = fixtureProfiles(), registry = personalProfiles(config);
  assert.equal(registry.resolve("owner").sessionId, "session-owner");
  assert.equal(registry.resolve("wife").fundingOwner, "owner");
  assert.notEqual(registry.resolve("owner").home, registry.resolve("wife").home);
  config.profiles[1].home = config.profiles[0].home;
  assert.notEqual(registry.resolve("owner").home, registry.resolve("wife").home);
  assert.throws(() => { registry.resolve("wife").home = "/tmp/owner"; }, TypeError);
  for (const uid of [null, "owner@example.com", "unknown", { uid: "owner" }])
    assert.throws(() => registry.resolve(uid), /pilot_forbidden/);
});

test("registry refuses overlapping homes, duplicate principals/sockets and unknown fields", () => {
  const cases = [
    c => { c.profiles[1].home = c.profiles[0].home; },
    c => { c.profiles[1].home = c.profiles[0].home + "/nested"; },
    c => { c.profiles[1].socket = c.profiles[0].socket; },
    c => { c.profiles[1].uid = c.profiles[0].uid; },
    c => { c.profiles[1].profileId = c.profiles[0].profileId; },
    c => { c.profiles[1].home = "/var/lib/../private"; },
    c => { c.profiles[1].home += "\n"; },
    c => { c.profiles[1].apiKey = "not-an-allowed-field"; },
    c => { c.fundingOwner = "unknown"; },
    c => { c.version = 2; },
  ];
  for (const mutate of cases) {
    const config = fixtureProfiles(); mutate(config);
    assert.throws(() => personalProfiles(config), /personal_config_invalid/);
  }
});
