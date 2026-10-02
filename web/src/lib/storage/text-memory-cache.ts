export function createTextMemoryCache(maxBytes: number, maxEntries: number) {
  const values = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  let bytes = 0;

  async function get(key: string, load: () => Promise<string>): Promise<string> {
    const value = values.get(key);
    if (value !== undefined) {
      values.delete(key);
      values.set(key, value);
      return value;
    }
    const current = pending.get(key);
    if (current) return current;
    const result = Promise.resolve().then(load).then((text) => {
      const size = Buffer.byteLength(text);
      if (size <= maxBytes) {
        const previous = values.get(key);
        if (previous !== undefined) {
          bytes -= Buffer.byteLength(previous);
          values.delete(key);
        }
        while (values.size && (bytes + size > maxBytes || values.size >= maxEntries)) {
          const oldest = values.keys().next().value!;
          bytes -= Buffer.byteLength(values.get(oldest)!);
          values.delete(oldest);
        }
        values.set(key, text);
        bytes += size;
      }
      return text;
    }).finally(() => { if (pending.get(key) === result) pending.delete(key); });
    if (pending.size < maxEntries) pending.set(key, result);
    return result;
  }

  return { get };
}
