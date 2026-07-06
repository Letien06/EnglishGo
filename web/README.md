# EnglishGo Next.js App

Next.js App Router application for EnglishGo, targeting deployment on Vercel.
Firebase Authentication, Cloud Firestore, Firebase Storage, Gemini, and DauToeic
content APIs provide the application services.

## Structure

```text
web/
  src/
    app/            App Router pages and API route handlers
    components/     Shared React components
    lib/            API helpers, services, auth, and env access
    types/          Shared TypeScript/domain types
  .env.example      Required environment variables
  vercel.json       Vercel project config
```

## Getting Started

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

## Production

The Vercel project root directory should be `web`.
