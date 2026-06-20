import { ConvexError } from 'convex/values';
import type { z } from 'zod';

export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.map((segment) => String(segment)),
      message: i.message,
    }));
    const first = issues[0];
    throw new ConvexError({
      kind: 'validation',
      field: first ? first.path.join('.') : '',
      message: first ? first.message : 'Invalid input',
      issues,
    });
  }
  return result.data;
}
