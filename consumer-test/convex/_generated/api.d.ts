/* eslint-disable */
/**
 * Hand-crafted to match `npx convex codegen` output for a consumer app.
 * Written for convex@1.31.7.
 *
 * This is the boundary test: the ComponentApi import resolves to the
 * pre-built dist/component/_generated/component.d.ts from the tarball.
 */

import type * as notifications from "../notifications.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  notifications: typeof notifications;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  notifications: import("convex-notifications/_generated/component.js").ComponentApi<"notifications">;
};
