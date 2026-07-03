/**
 * Request validation helpers using Zod schemas.
 *
 * Throws `BadRequest` (→ 400) with a JSON-formatted validation error
 * when the input does not match the schema.
 */
import type { ZodType } from "zod";
import { BadRequest } from "./response";

/**
 * Parse the JSON body of a `Request` (or `NextRequest`) against a Zod schema.
 */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw BadRequest("Invalid JSON body");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw BadRequest(
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  return result.data;
}

/**
 * Parse URL search params against a Zod schema.
 *
 * @param url - a `URL` object (e.g. `new URL(req.url)` in a route handler)
 */
export function parseQuery<T>(url: URL, schema: ZodType<T>): T {
  const raw = Object.fromEntries(url.searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw BadRequest(
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  return result.data;
}
