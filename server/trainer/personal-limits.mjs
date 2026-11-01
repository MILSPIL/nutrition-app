// Family use has no lifetime conversation quota. Historical accounting keeps
// its original scope; only one bounded physical execution may hold the queue.
export const PERSONAL_LIMITS = Object.freeze({
  scope: "hermes-personal-b3",
  turns: null,
  posts: null,
  postsPerTurn: 12,
  // 1.9.10: owner decision, a long message or ten photos need more than 90 s.
  deadlineMs: 180000,
  maxWaiting: 4,
  queueWindowMs: 450000,
});
