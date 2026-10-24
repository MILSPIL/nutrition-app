// One stamp per logical write, created outside retryable transaction callbacks.
// It is compatibility metadata, never a submission ID or part of commandHash.
export const writerStamp = () => ({ writerVersion: 3, writerNonce: crypto.randomUUID() });
