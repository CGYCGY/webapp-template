'use node';

declare const process: { env: Record<string, string | undefined> };

// Cloudflare R2 presigned URL actions.
//
// Required env vars (set with `npx convex env set <NAME> <VALUE>`):
//   R2_ACCOUNT_ID         — Cloudflare account ID
//   R2_ACCESS_KEY_ID      — R2 API token access key
//   R2_SECRET_ACCESS_KEY  — R2 API token secret
//   R2_BUCKET             — target bucket name

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { action } from './_generated/server';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

export const generatePresignedPutUrl = action({
  args: {
    contentType: v.string(),
    key: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { contentType, key },
  ): Promise<{ url: string; key: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: 'Not authenticated' });
    }

    // Scope objects to the caller's Convex userId so an authed user can't sign
    // a URL for another user's key. Reject any client-supplied key outside it.
    const user = await ctx.runQuery(internal.users.getByAuthIdInternal, {
      authId: identity.subject,
    });
    if (!user) throw new ConvexError({ message: 'User row not found' });
    const expectedPrefix = `uploads/${user._id}/`;
    if (key !== undefined && !key.startsWith(expectedPrefix)) {
      throw new ConvexError({
        message: 'Key must be under your uploads prefix',
      });
    }
    const objectKey = key ?? `${expectedPrefix}${crypto.randomUUID()}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: objectKey,
      ContentType: contentType,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 300 });
    return { url, key: objectKey };
  },
});

export const generatePresignedGetUrl = action({
  args: {
    key: v.string(),
  },
  handler: async (ctx, { key }): Promise<{ url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: 'Not authenticated' });
    }

    const user = await ctx.runQuery(internal.users.getByAuthIdInternal, {
      authId: identity.subject,
    });
    if (!user) throw new ConvexError({ message: 'User row not found' });
    if (!key.startsWith(`uploads/${user._id}/`)) {
      throw new ConvexError({
        message: 'Key must be under your uploads prefix',
      });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 3600 });
    return { url };
  },
});
