import { resolve, dirname } from "node:path";
import { fail } from "./limits.mjs";
import { privateRead } from "./private-files.mjs";

const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const exact = (object, fields) => object && typeof object === "object" && !Array.isArray(object) &&
  Object.keys(object).every(key => fields.includes(key));

// This operator-owned registry is not supplied by a client. Authentication must
// establish uid before resolution; neither an email nor a body field is a route.
export function personalProfiles(config) {
  if (!exact(config, ["version", "fundingOwner", "profiles"]) || config.version !== 1 ||
      !id(config.fundingOwner) || !Array.isArray(config.profiles) ||
      config.profiles.length < 1 || config.profiles.length > 2) fail("personal_config_invalid", 503);
  const profiles = new Map(), identities = new Set(), homes = new Set(), sockets = new Set();
  for (const profile of config.profiles) {
    if (!exact(profile, ["uid", "profileId", "home", "socket", "canonicalTitle"]) ||
        !id(profile.uid) || !id(profile.profileId) || profile.canonicalTitle !== "Bot Chat" ||
        ![profile.home, profile.socket].every(path => typeof path === "string" &&
          path.startsWith("/") && resolve(path) === path && !/[\0\r\n]/.test(path)) ||
        dirname(profile.socket) === "/" || profile.home === "/" ||
        profiles.has(profile.uid) || identities.has(profile.profileId) ||
        homes.has(profile.home) || sockets.has(profile.socket)) fail("personal_config_invalid", 503);
    homes.add(profile.home); sockets.add(profile.socket); identities.add(profile.profileId);
    profiles.set(profile.uid, Object.freeze({ ...profile, fundingOwner: config.fundingOwner }));
  }
  const paths = [...homes];
  if (paths.some((home, index) => paths.some((other, n) => n !== index && home.startsWith(other + "/"))))
    fail("personal_config_invalid", 503);
  if (!profiles.has(config.fundingOwner)) fail("personal_config_invalid", 503);
  return Object.freeze({
    resolve(uid) {
      if (!id(uid) || !profiles.has(uid)) fail("pilot_forbidden", 403);
      return profiles.get(uid);
    },
    // Operator use only. Never return this list from an authenticated user's API.
    entries: () => [...profiles.values()],
  });
}
export const readPersonalProfiles = file => personalProfiles(JSON.parse(privateRead(file)));
