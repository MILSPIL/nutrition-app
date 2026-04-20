# SciSense

SciSense is a nutrition tracker for clients and coaches. It helps log meals, track macros and calories, record body measurements, and share daily progress with a trainer through Firebase.

## Stack

- React 18
- React Router 7
- Firebase Auth, Firestore, Hosting
- Tailwind via CDN in `public/index.html`
- Jest via `react-scripts`

## Scripts

```bash
npm install
npm start
npm run build
npm run test:ci
```

## Project Map

- `src/pages/ClientApp.js`: client flow
- `src/pages/TrainerDashboard.js`: trainer flow
- `src/services/`: shared business logic and API helpers
- `src/utils/date.js`: local date helpers
- `src/data/products.js`: product database and default portions
- `firestore.rules`: Firestore access rules
- `.github/workflows/ci.yml`: CI checks

## Firestore Shape

```text
users/{uid}
users/{uid}/mealHistory/{YYYY-MM-DD}
users/{uid}/measurements/{YYYY-MM-DD}
trainers/{trainerId}
trainerRequests/{requestId}
```

## Quality

- Unit tests cover date helpers, nutrition math, measurement comparison, and barcode parsing.
- CI runs tests and production build on every push and pull request.
- Production build disables sourcemaps to avoid noisy `html5-qrcode` warnings in CRA.

## Collaboration

- `CONTRIBUTING.md`: branch, commit, PR, and review rules
- `.github/PULL_REQUEST_TEMPLATE.md`: PR checklist
- `.github/ISSUE_TEMPLATE/`: bug report and feature request templates
- `RELEASE_CHECKLIST.md`: release and merge checklist

## Notes

- The app version comes from `package.json` and is passed to the client through `REACT_APP_VERSION`.
- Shared local date helpers replace `toISOString().split('T')[0]` to avoid UTC drift near midnight.
