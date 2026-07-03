# EnglishGo — Next.js (Vercel)

Next.js (App Router, TypeScript, Tailwind) rewrite of the Spring Boot English
learning app, targeting deployment on **Vercel**. The Supabase PostgreSQL
database and Firebase (Auth + Firestore) are reused unchanged.

## Structure

```
web/
├─ src/
│  ├─ app/                # App Router pages + API route handlers
│  │  └─ api/health/      # deployment health check
│  ├─ components/         # shared React components
│  ├─ lib/
│  │  ├─ api/             # response envelope + centralized error handling
│  │  ├─ services/        # business logic ported from Java services
│  │  └─ env.ts           # env var access (server + public)
│  └─ types/              # shared TS/domain types
├─ .env.example           # required env vars (see docs/deployment.md)
└─ vercel.json            # Vercel project config
```

## Getting started

```bash
cd web
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

## Migration status

Tracked incrementally by domain (strangler pattern). See the migration plan.

- [x] Phase 0 — Next.js scaffold + Vercel config
- [ ] Phase 1 — Prisma data layer, Firebase Admin auth, API envelope
- [ ] Phase 2+ — Domain-by-domain port
