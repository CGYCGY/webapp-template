/* prettier-ignore */
/* eslint-disable */
/**
 * Generated API types — overwritten by `npx convex dev`.
 * Do not edit manually.
 */
import type { FunctionReference } from 'convex/server';

type AnyFunc = FunctionReference<
  'query' | 'mutation' | 'action',
  'public' | 'internal'
>;
type AnyModule = Record<string, AnyFunc>;

export declare const api: Record<string, AnyModule>;
export declare const internal: Record<string, AnyModule>;
