export async function alignGoogleClock(fetcher = fetch) {
  const nativeDate = Date;
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "HEAD",
    signal: AbortSignal.timeout(15_000),
  });
  const remoteTime = nativeDate.parse(response.headers.get("date") ?? "");
  if (!Number.isFinite(remoteTime)) throw new Error("Google did not provide a usable clock reference.");
  const offsetMs = remoteTime - nativeDate.now();
  if (Math.abs(offsetMs) > 24 * 60 * 60 * 1000) throw new Error("Clock differs by more than 24 hours; stop and check the host clock.");
  if (Math.abs(offsetMs) < 30_000) return { offsetMs: 0, restore() {} };
  const adjustedNow = () => nativeDate.now() + offsetMs;
  globalThis.Date = new Proxy(nativeDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(target, args.length ? args : [adjustedNow()], newTarget);
    },
    apply() {
      return new nativeDate(adjustedNow()).toString();
    },
    get(target, property, receiver) {
      return property === "now" ? adjustedNow : Reflect.get(target, property, receiver);
    },
  });
  return { offsetMs, restore() { globalThis.Date = nativeDate; } };
}
