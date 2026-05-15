import { describe, expect, it } from 'vitest';
import { profileFormSchema } from '@/convex/schemas/profile';

describe('profileFormSchema', () => {
  it('trims and accepts a valid displayName with empty bio default', () => {
    const result = profileFormSchema.parse({ displayName: '  Ada Lovelace  ' });
    expect(result.displayName).toBe('Ada Lovelace');
    expect(result.bio).toBe('');
  });

  it('rejects an empty displayName after trimming', () => {
    const result = profileFormSchema.safeParse({ displayName: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message;
      expect(message).toBe('Required');
    }
  });

  it('rejects a displayName over 80 chars', () => {
    const result = profileFormSchema.safeParse({ displayName: 'x'.repeat(81) });
    expect(result.success).toBe(false);
  });

  it('rejects a bio over 500 chars', () => {
    const result = profileFormSchema.safeParse({
      displayName: 'Ada',
      bio: 'y'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
