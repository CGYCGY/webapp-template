import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.string(),
    name: v.string(),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  }).index('authId', ['authId']),
});
