# 10,000-user capacity runbook

This runbook is for a staging deployment containing only disposable test data.
Do not send a high-volume test to the production URL while real users are
active.

## Required deployment configuration

1. Create an Upstash Redis database in the nearest practical region and set
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel Preview
   and Production.
2. Verify a Preview deployment can read Redis, then set
   `RATE_LIMIT_FAIL_CLOSED=true` and `CONCURRENCY_LIMIT_FAIL_CLOSED=true`.
   Without those switches the app deliberately remains available if the guard
   is missing or temporarily unavailable, which is useful locally but is not
   the production posture.
3. Start with `FIREBASE_MAX_CONCURRENCY=160`, `GEMINI_MAX_CONCURRENCY=12`, and
   `GEMINI_TIMEOUT_MS=20000`. Tune only from observed Firebase/Gemini quota,
   latency, and 429 data; never increase both limits during the same run.
4. The anonymous DauToeic catalog now sends a five-minute Vercel CDN TTL and
   one-day stale-while-revalidate. Responses with a session cookie or Bearer
   token are `private, no-store`, so personalized progress never enters the
   shared cache. Confirm `x-vercel-cache: HIT` after a warm request.
5. Add a Vercel Firewall rule for known bots and volumetric abuse before the
   application Proxy. The Redis guard below is the shared application-level
   policy; the platform firewall is the first-line protection that avoids
   spending a Redis command on traffic that should never reach the app.

The edge limiter is an atomic 60-second Redis sliding window per source IP.
Defaults are deliberately tightest for AI/external work (20/min), then writes
(120/min), public reads (600/min), and authenticated reads (1,200/min). Each
429 includes `Retry-After` and `RateLimit-*` headers. Existing per-user daily
AI quotas now also return HTTP 429 rather than HTTP 400.

## k6 distributed catalog test

The workload is at [public-catalog.js](../web/load-tests/k6/public-catalog.js).
It models one catalog request followed by 1.2 seconds of think time, ramps for
three minutes, holds for 12 minutes, and ramps down for two minutes. It aborts
on a catalog p95 above 300 ms or a failure rate at/above 0.1%.

Run only against a warm staging URL. Every runner needs a distinct value of
`RUNNER_INDEX` from `0` through `RUNNER_COUNT - 1`; all runners must use the
same `TARGET_VUS` and start within 30 seconds. Store the JSON summary from each
runner in one shared results location.

```powershell
cd D:\EnglishWebApp\web
$env:TARGET_URL = 'https://your-staging-deployment.vercel.app'
$env:TARGET_VUS = '1000'
$env:RUNNER_COUNT = '10'
$env:RUNNER_INDEX = '0' # Change on every runner.
$env:REQUIRE_CDN_HIT = 'true'
k6 run --summary-export results\catalog-1000-runner-0.json load-tests\k6\public-catalog.js
```

Use these gates; do not proceed when the current gate has an SLO breach,
Firebase quota warning, Gemini 429/5xx increase, or a sustained CPU/function
concurrency alarm.

| Gate | Total VUs | Suggested runners | Hold | Pass criteria |
| --- | ---: | ---: | ---: | --- |
| 1 | 100 | 1 | 12 min | Catalog p95 <300 ms, p99 <800 ms, errors <0.1% |
| 2 | 1,000 | 10 | 12 min | Gate 1 criteria; CDN hit rate remains high |
| 3 | 5,000 | 25 | 12 min | Gate 2 criteria; no Firebase/Gemini quota alarm |
| 4 | 10,000 | 50 | 12–15 min | Gate 3 criteria; clean 10-minute recovery afterward |

At Gates 2–4, do not use a single runner or spoof `X-Forwarded-For`: the edge
limiter correctly treats that as one source IP. Use a load platform/runners
with enough independent egress IPs, or temporarily raise **only the staging**
`RATE_LIMIT_CATALOG_PER_MIN` for this capacity workload. Exercise the real
production IP limit separately with a small abuse test. Never deploy a header
that lets callers choose their own client IP.

## Observability and sign-off

Collect a centralized k6 time series (Grafana Cloud k6, Prometheus remote
write, or equivalent) rather than averaging runner summaries. During every
hold, watch Vercel function count/duration, `x-vercel-cache`, Upstash command
latency/errors, Firestore reads/writes and quota, Gemini latency/429s, and API
5xx/429 rates. Preserve the k6 result JSON, deployment SHA, environment limits,
and dashboard links for each gate.

Do a final 10-minute low-traffic recovery check: cached catalog p95 must return
below 300 ms, 5xx must be below 0.1%, Redis semaphore keys must drain, and no
Firestore or Gemini quota should remain elevated. Only then promote the same
configuration from Preview to Production.
