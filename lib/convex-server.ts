import 'server-only';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { ConvexHttpClient } from 'convex/browser';
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from 'convex/server';
import { env } from '@/env';

export async function fetchAuthedQuery<
  Query extends FunctionReference<'query'>,
>(
  query: Query,
  ...args: OptionalRestArgs<Query>
): Promise<FunctionReturnType<Query> | null> {
  const { accessToken } = await withAuth();
  if (!accessToken) return null;
  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  client.setAuth(accessToken);
  return client.query(query, ...args);
}

export async function fetchAuthedMutation<
  Mutation extends FunctionReference<'mutation'>,
>(
  mutation: Mutation,
  ...args: OptionalRestArgs<Mutation>
): Promise<FunctionReturnType<Mutation> | null> {
  const { accessToken } = await withAuth();
  if (!accessToken) return null;
  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  client.setAuth(accessToken);
  return client.mutation(mutation, ...args);
}
