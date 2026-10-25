import { createInternalProcess } from "./internal-process.mjs";

// Only this profile callback surface exists. A profile can never request a
// payer credential or reserve a POST by emitting a differently named packet.
export function createPersonalProcess({ connection, toolSchemas, onModel, onTool, ...options }) {
  if (typeof onModel !== "function" || typeof onTool !== "function") throw Error("invalid_request");
  const process = createInternalProcess({ ...options, setup: { connection, toolSchemas },
    handlers: { model: (message, { signal }) => onModel(message.payload, { clientOptions: message.clientOptions, nativeBinding: message.nativeBinding, signal }),
      tool: (message, { signal }) => onTool(message.name, message.arguments, { nativeBinding: message.nativeBinding, signal }) },
    validateIdentity: identity => identity && typeof identity.profileId === "string" && typeof identity.instanceId === "string" && Number.isSafeInteger(identity.authorityEpoch) && identity.authorityEpoch > 0,
    validateEvent: message => typeof message.channel === "string" && /^(web|desktop)(:[A-Za-z0-9_-]{1,80})?$/.test(message.channel) && message.event && typeof message.event === "object",
  });
  return Object.freeze({ start: process.start,
    bot: (channel, options) => process.call("bot", { channel }, options),
    rpc: (channel, method, params, options) => process.call("rpc", { channel, method, params }, options),
    lookup: (channel, binding, options) => process.call("lookup", { channel, sessionId: binding.sessionId, inputId: binding.inputId, inputProof: binding.payloadHmac }, options),
    detach: channel => process.exited ? undefined : process.call("detach", { channel }),
    get exited() { return process.exited; }, abort: process.abort, waitForExit: process.waitForExit, close: process.close,
  });
}
