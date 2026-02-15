import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  notifications: defineTable({
    tenantId: v.optional(v.string()),
    userId: v.string(),
    event: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    readAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    transactional: v.optional(v.boolean()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_unread", ["userId", "readAt"])
    .index("by_tenantId_userId", ["tenantId", "userId"])
    .index("by_tenantId_userId_unread", ["tenantId", "userId", "readAt"]),

  preferences: defineTable({
    tenantId: v.optional(v.string()),
    userId: v.string(),
    level: v.union(
      v.literal("global"),
      v.literal("category"),
      v.literal("event"),
    ),
    key: v.optional(v.string()),
    channel: v.string(),
    enabled: v.boolean(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_level_key", ["userId", "level", "key"])
    .index("by_tenantId_userId", ["tenantId", "userId"])
    .index("by_tenantId_userId_level_key", ["tenantId", "userId", "level", "key"]),

  deduplication: defineTable({
    key: v.string(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),

  deliveryLog: defineTable({
    tenantId: v.optional(v.string()),
    notificationId: v.id("notifications"),
    channel: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    // External ID from delivery provider (e.g., Resend email ID, Twilio message SID)
    externalId: v.optional(v.string()),
  })
    .index("by_notificationId", ["notificationId"])
    .index("by_status", ["status"])
    .index("by_externalId", ["externalId"]),

  pushTokens: defineTable({
    tenantId: v.optional(v.string()),
    userId: v.string(),
    token: v.string(),
    platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
    deviceId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_token", ["token"])
    .index("by_tenantId_userId", ["tenantId", "userId"])
    .index("by_tenantId_token", ["tenantId", "token"]),

  /**
   * Scheduled notifications waiting to be sent.
   * Processed by a cron job that dispatches them when scheduledFor time is reached.
   */
  scheduledNotifications: defineTable({
    tenantId: v.optional(v.string()),
    userId: v.string(),
    event: v.string(),
    category: v.optional(v.string()),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    channels: v.any(), // Channel templates
    scheduledFor: v.number(), // Timestamp when to send
    transactional: v.optional(v.boolean()),
    deduplicationKey: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    error: v.optional(v.string()),
    processedAt: v.optional(v.number()),
  })
    .index("by_status_scheduledFor", ["status", "scheduledFor"])
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"]),

  /**
   * Retry queue for failed deliveries.
   * Used by the workflow component to retry failed channel dispatches.
   */
  retryQueue: defineTable({
    tenantId: v.optional(v.string()),
    notificationId: v.id("notifications"),
    deliveryLogId: v.id("deliveryLog"),
    channel: v.string(),
    attempt: v.number(),
    maxAttempts: v.number(),
    nextRetryAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("exhausted"),
    ),
    lastError: v.optional(v.string()),
    // Rendered content to retry
    rendered: v.any(),
  })
    .index("by_status_nextRetryAt", ["status", "nextRetryAt"])
    .index("by_notificationId", ["notificationId"])
    .index("by_notificationId_channel", ["notificationId", "channel"]),

  /**
   * Channel fallback queue.
   * Tracks push notifications that should fall back to email if unread.
   */
  fallbackQueue: defineTable({
    tenantId: v.optional(v.string()),
    notificationId: v.id("notifications"),
    userId: v.string(),
    fromChannel: v.string(), // e.g., "push"
    toChannel: v.string(), // e.g., "email"
    fallbackAt: v.number(), // When to trigger fallback
    status: v.union(
      v.literal("pending"),
      v.literal("cancelled"), // User read the notification
      v.literal("triggered"), // Fallback was sent
    ),
    triggeredAt: v.optional(v.number()),
  })
    .index("by_status_fallbackAt", ["status", "fallbackAt"])
    .index("by_notificationId", ["notificationId"]),
});
