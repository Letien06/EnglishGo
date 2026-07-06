# Go-Live Runbook

Use this after `npm test`, `npm run test:e2e`, and `npm run build` pass in `web/`.

## 1. Preflight

```powershell
cd D:\EnglishWebApp\web
npm test
npm run test:e2e
npm run build
```

Confirm Firebase:

- Firestore rules deployed from `firestore.rules`.
- Firestore indexes deployed from `firestore.indexes.json`.
- Storage rules deployed from `storage.rules`.
- Firebase Authentication providers enabled.
- Admin emails listed in `ADMIN_EMAILS`.

## 2. Deploy

```powershell
cd D:\EnglishWebApp\web
npx vercel deploy --prod
```

Verify:

- `/api/health`
- `/login`
- `/hub`
- `/vocab`
- `/listen`
- `/read`
- `/practice`
- `/community`
- `/ai/writing`
- `/account`
- `/billing`
- `/admin` with an admin account

## 3. Domain Cutover

In Vercel:

1. Add the production custom domain.
2. Copy DNS records from Vercel.
3. Update records at the DNS provider.
4. Keep `englishwebapp.vercel.app` available as fallback during propagation.

## 4. Monitoring Window

For the first several days, check:

- Vercel Function logs for 4xx/5xx spikes.
- Vercel Analytics and Speed Insights for slow routes.
- Firebase Authentication sign-in errors.
- Firestore index errors and read volume.
- Firebase Storage upload/read errors.
- Gemini and DauToeic API failures.

## 5. Post-Deploy

Run the verification suite again after any production rollback or major environment change.
