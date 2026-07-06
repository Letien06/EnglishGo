# EnglishWebApp

EnglishWebApp is a TOEIC practice web application. The production target is the Next.js app in `web/`, deployed to Vercel with Firebase Authentication, Cloud Firestore, Firebase Storage, and Gemini.

## Current Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Gemini API
- DauToeic external content API
- Vercel Analytics and Speed Insights

## Repository Layout

```text
web/                         Next.js application
firestore.rules              Firestore security rules
firestore.indexes.json       Firestore composite indexes
storage.rules                Firebase Storage rules
docs/deployment.md           Vercel/Firebase deployment guide
docs/nextjs-functional-comparison.md
```

## Local Development

Run commands from `web/`:

```powershell
cd D:\EnglishWebApp\web
npm install
Copy-Item .env.example .env.local
notepad .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

## Required Environment Variables

See `web/.env.example` and `docs/deployment.md`.

At minimum, local development needs:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_WEB_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `GEMINI_API_KEY`
- `ADMIN_EMAILS`
- `DAUTOEIC_ANON_KEY`

## Test And Build

```powershell
cd D:\EnglishWebApp\web
npm test
npm run test:e2e
npm run build
```

## Production Deploy

The Vercel project should use:

- Root Directory: `web`
- Framework: Next.js
- Region: `sin1`

Deploy with:

```powershell
cd D:\EnglishWebApp\web
npx vercel deploy --prod
```

Production health check:

```text
https://englishwebapp.vercel.app/api/health
```

## Firebase Deploy

Deploy rules and indexes from the repo root:

```powershell
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
```

## Main Routes

- `/` - public landing
- `/login` - Firebase login
- `/hub` - learner dashboard
- `/vocab` - vocabulary sets, progress, community folders
- `/listen` and `/listen/practice` - listening practice
- `/read` and `/read/practice` - reading practice
- `/practice` - TOEIC tests
- `/practice/history` - attempt history
- `/community` - comments and leaderboard
- `/ai/writing` - writing feedback
- `/account` - account settings
- `/billing` - plans and transactions
- `/admin` - admin dashboard, ADMIN only

## Notes

- Do not add SQL/Prisma/Supabase application storage to the Next.js app. Application data is stored in Firestore.
- Do not store uploaded media on the Vercel filesystem. Use Firebase Storage via `web/src/lib/services/media.ts`.
- Keep secrets out of Git. Use `.env.local` locally and Vercel environment variables in production.
