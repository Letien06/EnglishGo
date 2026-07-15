/**
 * Minimal Upstash REST client shared by Proxy and Node.js route handlers.
 *
 * Keeping this on the Fetch API avoids a Redis TCP connection per serverless
 * invocation and makes the same limiter work at Vercel's network boundary.
 */

interface UpstashConfig {
  url: string;
  token: string;
}

interface UpstashPipelineResult {
  result?: unknown;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 1_500;

export function getUpstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** Executes one Redis Lua script atomically through Upstash's REST pipeline. */
export async function executeRedisScript(
  script: string,
  keys: string[],
  args: Array<string | number>,
): Promise<unknown> {
  const config = getUpstashConfig();
  if (!config) throw new Error("Upstash Redis is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([[
        "EVAL",
        script,
        keys.length,
        ...keys,
        ...args.map(String),
      ]]),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as UpstashPipelineResult[] | null;
    const item = Array.isArray(body) ? body[0] : null;
    if (!response.ok || !item || item.error) {
      throw new Error(`Upstash Redis request failed (${response.status})`);
    }
    return item.result;
  } finally {
    clearTimeout(timeout);
  }
}
