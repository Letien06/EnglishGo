# EnglishWebApp

EnglishWebApp is a Spring Boot web app for English practice tests. The MVP uses Firebase Authentication for login and MySQL for the relational business data.

## Stack

- Java 17
- Spring Boot 3.x
- Maven
- MySQL 8.x
- Flyway
- Spring Data JPA
- Spring Security
- Firebase Authentication
- Thymeleaf
- Alpine.js

## Requirements

- JDK 17 or newer
- Maven 3.9.x
- MySQL 8.x
- A Firebase project with Authentication enabled
- A Firebase Admin SDK service account JSON file stored outside the repository

Do not commit Firebase service account files or real secrets.

## Quick Start To View The Project

Run these steps from the project folder:

```powershell
cd D:\EnglishWebApp
```

1. Start MySQL and create the database:

```sql
CREATE DATABASE englishwebapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Create local Spring config:

```powershell
Copy-Item src/main/resources/application-example.yml src/main/resources/application-dev.yml
```

Edit `src/main/resources/application-dev.yml` and set your MySQL username/password.

3. Create `.env` from `.env.example` and fill in your Firebase values:

```powershell
Copy-Item .env.example .env
notepad .env
```

Load `.env` into the same PowerShell window:

```powershell
.\scripts\load-env.ps1
```

This sets the same environment variables as:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:/secrets/englishwebapp-firebase-service-account.json"
$env:FIREBASE_WEB_API_KEY="your_web_api_key"
$env:FIREBASE_AUTH_DOMAIN="your_project.firebaseapp.com"
$env:FIREBASE_PROJECT_ID="your_project_id"
$env:FIREBASE_APP_ID="your_firebase_app_id"
```

4. Start the app:

```powershell
.\mvnw.cmd spring-boot:run
```

Spring Boot runs Flyway migrations automatically on startup.

5. Open the app:

```text
http://localhost:8080
```

The app redirects to `/login`. Use a Firebase Authentication user from your Firebase project. For the easiest first run, enable **Email/password** in Firebase and create a test user in Firebase Console.

After login, use these pages:

- `http://localhost:8080/` - dashboard
- `http://localhost:8080/tests` - TOEIC mini test seeded by Flyway
- `http://localhost:8080/vocab` - vocabulary flashcards
- `http://localhost:8080/lessons` - lessons
- `http://localhost:8080/community` - comments and leaderboard
- `http://localhost:8080/billing` - legacy billing page; learning features are planned to remain free
- `http://localhost:8080/ai/writing` - writing feedback demo

Teacher CMS requires the logged-in user role to be `TEACHER` or `ADMIN`. You can update it in MySQL after first login:

```sql
UPDATE users SET role = 'TEACHER' WHERE email = 'your_email@example.com';
```

Then open:

```text
http://localhost:8080/teacher/cms
```

## Database Setup

Create a local MySQL database:

```sql
CREATE DATABASE englishwebapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Copy the example config and fill in local values:

```powershell
Copy-Item src/main/resources/application-example.yml src/main/resources/application-dev.yml
```

Update `src/main/resources/application-dev.yml`:

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/englishwebapp?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true
    username: root
    password: your_mysql_password
    driver-class-name: com.mysql.cj.jdbc.Driver

  jpa:
    database-platform: org.hibernate.dialect.MySQLDialect

app:
  media-base-url: http://localhost:8080/media
  firebase:
    service-account-path: ${FIREBASE_SERVICE_ACCOUNT_PATH:}
    web-api-key: ${FIREBASE_WEB_API_KEY:}
    auth-domain: ${FIREBASE_AUTH_DOMAIN:}
    project-id: ${FIREBASE_PROJECT_ID:}
    app-id: ${FIREBASE_APP_ID:}
```

`application-dev.yml` is ignored by Git.

## Firebase Setup

Enable these Firebase Authentication providers:

- Email/password
- Google

Create a Firebase Admin SDK service account JSON file and store it outside this repo, for example:

```text
C:/secrets/englishwebapp-firebase-service-account.json
```

Set environment variables for backend verification and frontend Firebase JS SDK config:

```powershell
Copy-Item .env.example .env
notepad .env
.\scripts\load-env.ps1
```

Or set them manually:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:/secrets/englishwebapp-firebase-service-account.json"
$env:FIREBASE_WEB_API_KEY="your_web_api_key"
$env:FIREBASE_AUTH_DOMAIN="your_project.firebaseapp.com"
$env:FIREBASE_PROJECT_ID="your_project_id"
$env:FIREBASE_APP_ID="your_firebase_app_id"
```

## Run Migrations

The usual local workflow is to let Spring Boot run Flyway automatically:

```powershell
.\mvnw.cmd spring-boot:run
```

If you want to run Flyway manually from Maven, pass the database settings explicitly because the Flyway Maven plugin does not read `application-dev.yml`:

```powershell
.\mvnw.cmd flyway:migrate `
  "-Dflyway.url=jdbc:mysql://localhost:3306/englishwebapp?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true" `
  "-Dflyway.user=root" `
  "-Dflyway.password=your_mysql_password"
```

Current migrations:

- `V1__init.sql`: initial relational schema
- `V2__seed.sql`: TOEIC mini seed data

## Run The App

```powershell
.\mvnw.cmd spring-boot:run
```

Open:

```text
http://localhost:8080
```

Main routes:

- `/login`: Firebase login
- `/`: dashboard
- `/tests`: test list
- `/tests/{id}/practice`: take a test
- `/history`: attempt history
- `/attempts/{id}/review`: review answers
- `/vocab`: vocabulary sets
- `/vocab/sets/{id}/flashcards`: flashcard review with SM-2 progress
- `/lessons`: grammar and lesson list
- `/billing`: legacy billing route; learning features should not be locked behind payment
- `/community`: comments and leaderboard
- `/ai/writing`: writing feedback jobs
- `/teacher/cms`: teacher content management

## Troubleshooting

### Unknown database `englishwebapp`

This means MySQL is running and the username/password are accepted, but the database has not been created yet.

Open MySQL and create it:

```powershell
mysql -u root -p
```

Enter your MySQL password, then run:

```sql
CREATE DATABASE englishwebapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SHOW DATABASES;
EXIT;
```

Then start the app again:

```powershell
.\mvnw.cmd spring-boot:run
```

Spring Boot will run the Flyway migrations automatically after the database exists.

### `mvn` is not recognized

Use the Maven Wrapper included in this project:

```powershell
.\mvnw.cmd spring-boot:run
```

## Test

```powershell
.\mvnw.cmd test
```

## Notes

- Firebase is used only for authentication.
- MySQL remains the main database for users, tests, questions, attempts, answers, and drafts.
- Schema changes must be added through new Flyway migration files.
- Do not edit old migrations after they have been applied to a shared database.
- Billing/subscription records are legacy/demo data only. The product plan is free-first: no learner feature should require payment.
- AI writing feedback currently uses an internal deterministic evaluator and persists jobs in MySQL. A provider-backed worker can replace this service later without changing the UI routes.
