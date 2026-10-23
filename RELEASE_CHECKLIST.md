# Release Checklist

Use this before merging a release-sized change or tagging a new version.

## Code and Product

- [ ] Scope is clear and matches the planned release
- [ ] No unrelated changes are mixed into the release
- [ ] Version in `package.json` is correct
- [ ] Новини в `src/data/releases.js` актуальні, людська версія збігається з `package.json`
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

## Голос і фото: обов’язкові гейти

- [ ] `npm run test:voice-photo` пройшов: клієнт, Worker, demo Firestore
- [ ] QA 375/390/1366 з числовими відступами та підтвердженим cleanup
- [ ] V01–V03/V09 перевірені на реальному телефоні й погоджених API, а не лише на fixtures
- [ ] Проєктні ключі, точні моделі/тарифи, бюджет і політика зберігання API погоджені
- [ ] G04 доступу пройдено до приватного пілоту
- [ ] Старий відкритий writer не може стерти day markers/revision; контрольоване оновлення перевірене
- [ ] Змішане старе/нове production-розгортання заборонено до попереднього пункту
- [ ] Юрій окремо погодив публікацію; код у PR сам не дозволяє deploy
- [ ] Після пілоту Юрій прийняв продукт за погодженими порогами Goal
