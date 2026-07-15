# Controlled local load-test report — 15 July 2026

## Scope and safety boundary

This exercise used a production Next.js build on `127.0.0.1` only. It did **not** send high-volume traffic to the deployed site. Results describe one local application instance, not Vercel, Firebase, a CDN, or a production network.

The reusable harness is [`web/scripts/load-test.mjs`](web/scripts/load-test.mjs). It rejects non-loopback URLs and caps local runs at 2,000 concurrent requests / 20,000 total requests to avoid locking the workstation.

## Results

| Target | Concurrent requests | Total requests | Throughput | p95 | p99 | Errors / timeouts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/api/health` | 100 | 1,000 | 1,056 rps | 118 ms | 145 ms | 0 / 0 |
| `/login` | 100 | 500 | 742 rps | 207 ms | 209 ms | 0 / 0 |
| `/api/dautoeic/vocab/catalog` | 100 | 500 | 868 rps | 114 ms | 194 ms | 0 / 0 |
| `/api/health` | 1,000 | 5,000 | 1,187 rps | 881 ms | 1,015 ms | 0 / 0 |
| `/login` | 1,000 | 2,000 | 931 rps | 1,220 ms | 1,241 ms | 0 / 0 |
| `/api/health` | 2,000 | 10,000 | 1,500 rps | 1,574 ms | 1,838 ms | 0 / 0 |

At 2,000 concurrent health requests, the local event loop delayed by up to 289 ms. The app recovered immediately after the burst: `/api/health` and `/login` both still returned HTTP 200.

## Capacity conclusion

- **100 concurrent users:** the tested public paths are comfortably responsive on one local instance.
- **1,000 concurrent users:** the server stayed available, but ~0.9–1.2 s p95 is no longer a premium UX target.
- **2,000 concurrent users:** no errors occurred, but p95 exceeded 1.5 s; a single instance is nearing a user-visible saturation zone.
- **10,000 concurrent users:** not certified. A 10k test needs a staged, distributed exercise against a production-like environment; extrapolating from localhost would be misleading and sending that traffic to production without a maintenance window risks real users.

## Findings

### P0 — no shared burst rate limit

The application has 71 API route files, but only 4 currently call `enforceDailyActionLimit`. The existing limit is a per-user, per-day Firestore transaction; it is not an IP/global sliding-window rate limit. Public endpoints such as `/api/health`, public vocabulary listing, and the DauToeic catalog can therefore be repeatedly requested without an application-level `429` response.

### P0 — quota exhaustion returns the wrong semantic status

`enforceDailyActionLimit` throws `BadRequest`, so an exhausted quota becomes HTTP 400 rather than HTTP 429 with `Retry-After`. Clients and observability cannot distinguish a malformed request from throttling.

### P1 — public response hardening needs deployment confirmation

The local health response includes `X-Content-Type-Options: nosniff` and a referrer policy, but no CSP, frame policy, HSTS, or RateLimit headers. HSTS cannot be evaluated over localhost HTTP, so verify the deployed Vercel headers separately before treating this as a production finding.

## Required scale plan before claiming 10k capacity

1. Add a distributed sliding-window limiter at the edge (for example Vercel Firewall + Upstash Redis): public read routes per IP, authenticated writes per IP **and** user, and far tighter quotas for AI/external-provider routes. Return `429`, `Retry-After`, and standard `RateLimit-*` headers.
2. Cache anonymous catalog/list responses at the CDN with explicit revalidation. Avoid Firestore reads for every anonymous request.
3. Protect Firebase and external dictionary/AI calls with concurrency caps, short server deadlines, circuit breaking, and a queue for non-interactive work.
4. Define SLOs: p95 under 300 ms for cached reads, under 800 ms for authenticated reads, and error rate below 0.1%. Alert on p95, 5xx, 429, Firestore quota, and external dependency latency.
5. Run k6 or Artillery from several isolated runners against a staging deployment: ramp 100 → 1,000 → 5,000 → 10,000 virtual users, hold each stage 10–15 minutes, and stop automatically if p95/error budgets breach. Use disposable test accounts and test data only.

## Reproduce locally

```powershell
cd D:\EnglishWebApp\web
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
node scripts/load-test.mjs --path /api/health --concurrency 100 --requests 1000
```
