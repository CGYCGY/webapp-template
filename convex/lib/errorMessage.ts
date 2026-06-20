// Detect ConvexError by its global-symbol brand rather than `instanceof`: this
// helper is imported by client code that may resolve a distinct `convex` copy,
// so the class identity differs but `Symbol.for('ConvexError')` is stable.
const CONVEX_ERROR_BRAND = Symbol.for('ConvexError');

export function errorMessage(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<symbol, unknown>)[CONVEX_ERROR_BRAND] === true
  ) {
    const data = (err as { data?: unknown }).data as
      | { message?: unknown }
      | null
      | undefined;
    if (data && typeof data.message === 'string' && data.message.length > 0) {
      return data.message;
    }
  }
  return 'Something went wrong. Please try again.';
}
