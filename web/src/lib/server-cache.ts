import { unstable_cache } from "next/cache";

/**
 * Runs a tagged Next data-cache read in the app, while keeping domain-service
 * unit tests independent from Next's request/incremental-cache runtime.
 */
export async function readServerCache<T>(
  reader: () => Promise<T>,
  keyParts: string[],
  options: { revalidate: number; tags: string[] },
): Promise<T> {
  const cached = unstable_cache(reader, keyParts, options);
  try {
    return await cached();
  } catch (error) {
    // Vitest calls services without Next's IncrementalCache. This is not a
    // production failure; execute the source reader so unit tests still cover
    // the same data transformation.
    if (error instanceof Error && error.message.includes("incrementalCache missing")) {
      return reader();
    }
    throw error;
  }
}
