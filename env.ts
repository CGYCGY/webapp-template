import { createEnv } from '@t3-oss/env-nextjs';
import * as z from 'zod';

export const env = createEnv({
  server: {
    WORKOS_CLIENT_ID: z.string().min(1),
    WORKOS_API_KEY: z.string().min(1),
    WORKOS_COOKIE_PASSWORD: z.string().min(32),
    WORKOS_WEBHOOK_SECRET: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_CONVEX_URL: z.string().min(1),
    NEXT_PUBLIC_WORKOS_CLIENT_ID: z.string().min(1),
  },
  runtimeEnv: {
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
    WORKOS_API_KEY: process.env.WORKOS_API_KEY,
    WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
    WORKOS_WEBHOOK_SECRET: process.env.WORKOS_WEBHOOK_SECRET,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_WORKOS_CLIENT_ID: process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID,
  },
  emptyStringAsUndefined: true,
});
