# Contributing to SciSense

This project is small, but it still needs discipline. These rules keep `main` stable and make changes easier to review.

## Workflow

1. Start from a fresh branch off `main`.
2. Keep one branch for one task.
3. Make the smallest change that solves the task.
4. Add or update tests when behavior changes.
5. Update docs when version, behavior, setup, or architecture changes.
6. Open a pull request instead of pushing straight to `main`.

## Branch Naming

Use short names with a clear purpose:

- `codex/fix-local-dates`
- `codex/add-firestore-rules`
- `codex/refactor-clientapp-meals`

If the branch mixes multiple goals, split it.

## Commit Style

Prefer small commits with direct messages:

- `fix: use local date keys in trainer dashboard`
- `test: cover nutrition totals`
- `docs: update development journal`
- `refactor: move measurement helpers into service`

Avoid vague messages like `changes`, `update`, or `fix stuff`.

## Pull Request Rules

- One PR should answer one question: what changed and why.
- Put risky refactors and product behavior changes in separate commits when possible.
- If a change affects UI, add screenshots or a short video.
- If a change affects Firestore data or rules, describe the impact clearly.
- If a change affects user flow, update `README.md` or `DEVELOPMENT.md`.
- `main` is protected in GitHub: changes should go through a pull request with green CI and resolved review threads.

## Quality Gate

Before opening or merging a PR, run:

```bash
npm run test:ci
npm run build
```

Do not merge if these checks fail.

## GitHub Merge Policy

- `main` uses a GitHub ruleset on the default branch
- direct non-fast-forward pushes and branch deletion are blocked
- pull requests are required before merge
- required conversations must be resolved before merge
- status checks must pass before merge
- history stays linear
- allowed merge methods are `squash` and `rebase`
- merged head branches are deleted automatically

## Testing Expectations

Add tests when you touch:

- date logic
- nutrition calculations
- measurement comparison
- data normalization from Open Food Facts
- Firestore-related business rules when extracted into testable functions

If a change is hard to test, call that out in the PR and explain what was checked manually.

## Docs and Journal

Update these files when relevant:

- `README.md` for setup, architecture, or usage changes
- `DEVELOPMENT.md` for version history, release notes, and project-level changes

## What To Avoid

- pushing directly to `main`
- mixing refactor, bugfix, and unrelated cleanup in one PR
- changing critical logic without tests
- updating dependencies without verifying tests and build
- leaving TODO comments without context

## Review Mindset

Reviews should focus on:

- behavior regressions
- data safety
- security impact
- test coverage gaps
- docs drift

Clean code matters, but stable behavior matters more.
