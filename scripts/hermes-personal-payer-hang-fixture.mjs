import { createInterface } from "node:readline";
const lines = createInterface({ input: process.stdin });
lines.on("line", line => {
  const message = JSON.parse(line);
  if (message.type === "setup") process.stdout.write(JSON.stringify({ type: "result", id: message.id,
    result: { instanceId: "synthetic-payer", provider: "openai-codex", model: "synthetic", supportsTools: true, contextWindow: 128000 } }) + "\n");
  if (message.type === "invoke" && message.payload?.success) {
    process.stdout.write(JSON.stringify({ type: "result", id: message.id, result: { completion: {}, proof: { rawTerminalModelVerified: true, selectedProvider: "openai-codex", selectedModel: "synthetic", model: "synthetic" } } }) + "\n");
  } else if (message.type === "invoke") {
    // A real blocked process cannot receive/obey a close or cancellation frame.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  }
});
