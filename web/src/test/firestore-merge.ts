/** Models set(..., {merge:true}) nested-map and FieldValue transform semantics. */
export function mergeFirestoreWrite(previous: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object") {
      const transform = value as { operand?: number; elements?: unknown[] };
      const name = value.constructor.name;
      if (name === "DeleteTransform") {
        delete next[key];
      } else if (name === "NumericIncrementTransform") {
        next[key] = (typeof next[key] === "number" ? next[key] as number : 0) + transform.operand!;
      } else if (name === "ArrayUnionTransform") {
        next[key] = [...new Set([...(Array.isArray(next[key]) ? next[key] as unknown[] : []), ...transform.elements!])];
      } else if (name === "ServerTimestampTransform") {
        next[key] = new Date();
      } else if (Object.getPrototypeOf(value) === Object.prototype) {
        next[key] = mergeFirestoreWrite(next[key] && typeof next[key] === "object" ? next[key] as Record<string, unknown> : {}, value as Record<string, unknown>);
      } else next[key] = value;
    } else next[key] = value;
  }
  return next;
}
