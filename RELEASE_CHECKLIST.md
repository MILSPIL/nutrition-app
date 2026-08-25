# Release Checklist

Use this before merging a release-sized change or tagging a new version.

## Code and Product

- [ ] Scope is clear and matches the planned release
- [ ] No unrelated changes are mixed into the release
- [ ] Version in `package.json` is correct
- [ ] If needed, `src/components/WelcomeModal.js` changelog is updated
- [ ] `DEVELOPMENT.md` journal entry is updated
- [ ] `README.md` is updated if setup or behavior changed

## Quality

- [ ] `npm run test:ci` passes
- [ ] `npm run build` passes
- [ ] New behavior has tests, or manual checks are documented
- [ ] Lint warnings were checked during build output

## Data and Security

- [ ] Firestore rules were reviewed if data access changed
- [ ] Firebase config is in sync with deployed resources
- [ ] Any migration or data-shape change is described in the PR

## PR and Merge

- [ ] PR title describes the actual change
- [ ] PR body explains what changed, why, risks, and verification
- [ ] Screenshots are attached for UI changes
- [ ] Merge only after CI is green

## After Merge

- [ ] Deploy steps are known
- [ ] Post-merge smoke check plan is clear
