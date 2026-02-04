/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as delivery from "../delivery.js";
import type * as fallback from "../fallback.js";
import type * as inbox from "../inbox.js";
import type * as notifications from "../notifications.js";
import type * as preferences from "../preferences.js";
import type * as pushTokens from "../pushTokens.js";
import type * as retry from "../retry.js";
import type * as scheduled from "../scheduled.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  delivery: typeof delivery;
  fallback: typeof fallback;
  inbox: typeof inbox;
  notifications: typeof notifications;
  preferences: typeof preferences;
  pushTokens: typeof pushTokens;
  retry: typeof retry;
  scheduled: typeof scheduled;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
