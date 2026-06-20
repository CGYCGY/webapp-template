import { ConvexError, v } from 'convex/values';
import { internalQuery, mutation, query } from './_generated/server';
import { parseOrThrow } from './lib/validate';
import { profileFormSchema } from './schemas/profile';

declare const process: { env: Record<string, string | undefined> };

// Diagnostic: throws when the WorkOS→Convex JWT bridge is broken so the
// dashboard can distinguish "bridge broken" from "webhook not yet fired."
// The verbose reason is dev-only so production clients don't see internal
// diagnostics; no token identifier is returned.
export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message:
          process.env.NODE_ENV === 'production'
            ? 'Not authenticated.'
            : 'No Convex identity — JWT bridge is broken or user is not signed in.',
      });
    }
    return { subject: identity.subject };
  },
});

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();
  },
});

export const getByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    return ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', authId))
      .unique();
  },
});

export const getByAuthIdInternal = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    return ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', authId))
      .unique();
  },
});

// JIT user provisioning: the WorkOS user.created webhook only fires for sign-ups
// originated against THIS deployment. A WorkOS account created via another app
// in the same org arrives with a valid JWT but no Convex row. Called once per
// sign-in from the client identity bridge so first mutations don't fail.
// Idempotent — paired with the webhook handler (also idempotent) so the two
// can't race into duplicate rows for a sign-up that originated here.
export const bootstrapSelf = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: 'Not authenticated' });
    const existing = await ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (existing) return existing;
    const id = await ctx.db.insert('users', {
      authId: identity.subject,
      email: identity.email ?? '',
      name: identity.name ?? '',
    });
    return await ctx.db.get(id);
  },
});

export const completeOnboarding = mutation({
  args: v.object({
    displayName: v.string(),
    bio: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: 'Not authenticated' });
    }
    const parsed = parseOrThrow(profileFormSchema, args);
    const existing = await ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: parsed.displayName,
        bio: parsed.bio,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return ctx.db.insert('users', {
      authId: identity.subject,
      email: identity.email ?? '',
      name: identity.name ?? '',
      displayName: parsed.displayName,
      bio: parsed.bio,
      updatedAt: Date.now(),
    });
  },
});

export const updateProfile = mutation({
  args: v.object({
    displayName: v.string(),
    bio: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: 'Not authenticated' });
    }
    const parsed = parseOrThrow(profileFormSchema, args);
    const user = await ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', identity.subject))
      .unique();
    if (!user) {
      throw new ConvexError({
        message:
          'User row not found — WorkOS webhook has not synced this user yet.',
      });
    }
    // Skip patch when nothing changed: avoids a write and the subscription
    // invalidation it triggers across every getMe subscriber.
    if (
      user.displayName === parsed.displayName &&
      (user.bio ?? '') === (parsed.bio ?? '')
    ) {
      return user._id;
    }
    await ctx.db.patch(user._id, {
      displayName: parsed.displayName,
      bio: parsed.bio,
      updatedAt: Date.now(),
    });
    return user._id;
  },
});
