import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const targetUrl = requiredUrl(__ENV.TARGET_URL);
const totalVus = positiveInt(__ENV.TARGET_VUS, 100);
const runnerCount = positiveInt(__ENV.RUNNER_COUNT, 1);
const runnerIndex = nonNegativeInt(__ENV.RUNNER_INDEX, 0);
const runnerVus = splitVus(totalVus, runnerCount, runnerIndex);
const catalogLatency = new Trend('catalog_latency_ms', true);

if (runnerIndex >= runnerCount) {
  throw new Error('RUNNER_INDEX must be less than RUNNER_COUNT.');
}

export const options = {
  scenarios: {
    public_catalog: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP_UP || '3m', target: runnerVus },
        { duration: __ENV.HOLD || '12m', target: runnerVus },
        { duration: __ENV.RAMP_DOWN || '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_failed{workload:catalog}': [
      { threshold: 'rate<0.001', abortOnFail: true, delayAbortEval: '1m' },
    ],
    'http_req_duration{workload:catalog}': [
      { threshold: 'p(95)<300', abortOnFail: true, delayAbortEval: '2m' },
      'p(99)<800',
    ],
    catalog_latency_ms: ['p(95)<300'],
    checks: ['rate>0.999'],
  },
  tags: {
    workload: 'catalog',
    runner: String(runnerIndex),
    total_vus: String(totalVus),
  },
};

export default function publicCatalogWorkload() {
  const response = http.get(`${targetUrl}/api/dautoeic/vocab/catalog`, {
    headers: { Accept: 'application/json' },
    tags: { workload: 'catalog', endpoint: 'catalog' },
  });
  catalogLatency.add(response.timings.duration);

  const requiresCdnHit = __ENV.REQUIRE_CDN_HIT === 'true';
  check(response, {
    'catalog returns 200': (res) => res.status === 200,
    'catalog has API envelope': (res) => res.json('success') === true,
    'catalog is served from Vercel cache when required': (res) => !requiresCdnHit ||
      ['HIT', 'STALE'].includes(res.headers['X-Vercel-Cache']),
  });

  // A short think time makes each VU approximate one active browser rather
  // than a tight-loop request generator.
  sleep(Number(__ENV.THINK_SECONDS || '1.2'));
}

function splitVus(total, runners, index) {
  const base = Math.floor(total / runners);
  return base + (index < total % runners ? 1 : 0);
}

function positiveInt(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Expected a positive integer environment variable.');
  }
  return parsed;
}

function nonNegativeInt(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Expected a non-negative integer environment variable.');
  }
  return parsed;
}

function requiredUrl(value) {
  if (!value) throw new Error('TARGET_URL is required. Use a staging deployment URL.');
  return value.replace(/\/$/, '');
}
