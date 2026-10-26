// Family use has no lifetime conversation quota. Historical accounting keeps
// its original scope; only one bounded physical execution may hold the queue.
export const PERSONAL_LIMITS = Object.freeze({
  scope: "hermes-personal-b3",
  turns: null,
  posts: null,
  postsPerTurn: 12,
  deadlineMs: 90000,
  maxWaiting: 4,
  queueWindowMs: 225000,
});
