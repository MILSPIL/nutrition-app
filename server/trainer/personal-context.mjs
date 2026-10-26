// One native profile is the source of facts and confirmed memory. This adapter
// never creates an independent editable copy in the app database.
export function createPersonalContext(uid, core) {
  return Object.freeze({
    read: signal => core.context(uid, { signal }),
    commit({ proposalId, baseRevision, text }, { signal } = {}) {
      return core.commitContext(uid, { proposalId, baseRevision, text }, { signal });
    },
  });
}
