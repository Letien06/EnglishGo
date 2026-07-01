# Deployment

This project is a Spring Boot application. For Vercel, deploy it as a container using `Dockerfile.vercel`. For Supabase, use the PostgreSQL database connection with the `prod` Spring profile.

## Supabase

Create a Supabase project and copy the PostgreSQL connection details from the project settings. Use the JDBC URL form:

```text
jdbc:postgresql://db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

Set these environment variables in the hosting provider:

```text
SPRING_PROFILES_ACTIVE=prod
DATABASE_URL=jdbc:postgresql://db.<project-ref>.supabase.co:5432/postgres?sslmode=require
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=<supabase-database-password>
DATABASE_POOL_SIZE=5
```

On first startup, Flyway runs the PostgreSQL migrations from:

```text
src/main/resources/db/migration/postgresql
```

## Vercel

This repo includes `Dockerfile.vercel` for Vercel's container-based deployment path. Required Vercel project environment variables:

```text
SPRING_PROFILES_ACTIVE=prod
DATABASE_URL=jdbc:postgresql://db.<project-ref>.supabase.co:5432/postgres?sslmode=require
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=<supabase-database-password>
DATABASE_POOL_SIZE=5
FIREBASE_WEB_API_KEY=<firebase-web-api-key>
FIREBASE_AUTH_DOMAIN=<firebase-auth-domain>
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_APP_ID=<firebase-app-id>
FIREBASE_SERVICE_ACCOUNT_JSON=<firebase-service-account-json-one-line>
ADMIN_EMAILS=<comma-separated-admin-emails>
GEMINI_API_KEY=<gemini-api-key>
GEMINI_MODEL=gemini-2.5-flash
MEDIA_BASE_URL=https://<vercel-domain>/media
```

Use `FIREBASE_SERVICE_ACCOUNT_JSON` for production containers. Keep `FIREBASE_SERVICE_ACCOUNT_PATH` for local development only.

Deploy with the Vercel CLI after logging in:

```powershell
npm install -g vercel
vercel login
vercel --prod
```

## Local Verification

```powershell
.\mvnw.cmd test
.\mvnw.cmd -DskipTests package
```

To test the Vercel container locally, start Docker Desktop first:

```powershell
docker build -f Dockerfile.vercel -t englishwebapp-vercel .
docker run --rm -p 8080:80 --env-file .env englishwebapp-vercel
```
