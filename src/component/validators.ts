/**
 * Shared validators derived from the schema.
 *
 * These provide runtime type safety for function return types
 * instead of using v.any(). They mirror the schema definitions
 * and include system fields (_id, _creationTime).
 */

import { v } from "convex/values";

// --- Shared field definitions (reused by validators) ---

const levelValidator = v.union(
  v.literal("global"),
  v.literal("category"),
  v.literal("event"),
);

const deliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("failed"),
);

const scheduledStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const retryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("succeeded"),
  v.literal("exhausted"),
);

const fallbackStatusValidator = v.union(
  v.literal("pending"),
  v.literal("cancelled"),
  v.literal("triggered"),
);

// --- Document validators (schema fields + system fields) ---

export const notificationValidator = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  tenantId: v.optional(v.string()),
  userId: v.string(),
  event: v.string(),
  title: v.string(),
  body: v.string(),
  data: v.optional(v.any()),
  readAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  required: v.optional(v.boolean()),
});

export const preferenceValidator = v.object({
  _id: v.id("preferences"),
  _creationTime: v.number(),
  tenantId: v.optional(v.string()),
  userId: v.string(),
  level: levelValidator,
  key: v.optional(v.string()),
  channel: v.string(),
  enabled: v.boolean(),
});

export const deliveryLogValidator = v.object({
  _id: v.id("deliveryLog"),
  _creationTime: v.number(),
  tenantId: v.optional(v.string()),
  notificationId: v.id("notifications"),
  channel: v.string(),
  status: deliveryStatusValidator,
  reason: v.optional(v.string()),
  sentAt: v.optional(v.number()),
  metadata: v.optional(v.any()),
  externalId: v.optional(v.string()),
});

export const scheduledNotificationValidator = v.object({
  _id: v.id("scheduledNotifications"),
  _creationTime: v.number(),
  tenantId: v.optional(v.string()),
  userId: v.string(),
  event: v.string(),
  category: v.optional(v.string()),
  data: v.optional(v.any()),
  scheduledFor: v.number(),
  required: v.optional(v.boolean()),
  deduplicationKey: v.optional(v.string()),
  status: scheduledStatusValidator,
  reason: v.optional(v.string()),
  processedAt: v.optional(v.number()),
});

export const retryQueueValidator = v.object({
  _id: v.id("retryQueue"),
  _creationTime: v.number(),
  tenantId: v.optional(v.string()),
  notificationId: v.id("notifications"),
  deliveryLogId: v.id("deliveryLog"),
  channel: v.string(),
  attempt: v.number(),
  maxAttempts: v.number(),
  nextRetryAt: v.number(),
  status: retryStatusValidator,
  lastError: v.optional(v.string()),
  rendered: v.any(),
});

export const fallbackQueueValidator = v.object({
  _id: v.id("fallbackQueue"),
  _creationTime: v.number(),
  tenantId: v.optional(v.string()),
  notificationId: v.id("notifications"),
  userId: v.string(),
  fromChannel: v.string(),
  toChannel: v.string(),
  fallbackAt: v.number(),
  status: fallbackStatusValidator,
  triggeredAt: v.optional(v.number()),
});
