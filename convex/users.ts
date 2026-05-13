import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

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
