import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// Diagnostic: throws when the WorkOS→Convex JWT bridge is broken so the
// dashboard can distinguish "bridge broken" from "webhook not yet fired."
export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error(
        'No Convex identity — JWT bridge is broken or user is not signed in.',
      );
    }
    return {
      subject: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
    };
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

export const upsert = mutation({
  args: {
    authId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { authId, email, name }) => {
    const existing = await ctx.db
      .query('users')
      .withIndex('authId', (q) => q.eq('authId', authId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { email, name });
      return existing._id;
    }

    return ctx.db.insert('users', { authId, email, name });
  },
});
