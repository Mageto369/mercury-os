/**
 * Serialise a value for a jsonb parameter.
 *
 * postgres.js offers sql.json() for this, but under the Next.js production
 * bundle its wrapper (like a Date) reaches the driver unrecognised and throws
 * ERR_INVALID_ARG_TYPE, failing the request with an opaque 500. It succeeded in
 * some modules and failed in others, which made the behaviour unpredictable.
 *
 * Passing the JSON text and casting it in SQL is explicit, portable and does
 * not depend on cross-module instanceof checks. Use as: ${toJsonb(x)}::jsonb
 */
export function toJsonb(value: unknown): string {
  return JSON.stringify(value ?? null);
}
