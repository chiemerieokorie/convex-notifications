import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  notifications: defineTable({
    userId: v.string(),
    event: v.string(),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    actionUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    readAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    transactional: v.optional(v.boolean()),
  })
    .index("by_userId", ["userId", "_creationTime"])
    .index("by_userId_unread", ["userId", "readAt"])
    .index("by_userId_active", ["userId", "archivedAt", "_creationTime"]),

  preferences: defineTable({
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
    .index("by_userId_level_key", ["userId", "level", "key"]),

  deduplication: defineTable({
    key: v.string(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),

  deliveryLog: defineTable({
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
  })
    .index("by_notificationId", ["notificationId"])
    .index("by_status", ["status"]),

  pendingBatches: defineTable({
    batchKey: v.string(),
    userId: v.string(),
    event: v.string(),
    items: v.array(v.any()),
    windowEndsAt: v.number(),
    flushed: v.boolean(),
  })
    .index("by_batchKey", ["batchKey"])
    .index("by_flushed_windowEndsAt", ["flushed", "windowEndsAt"]),

  cancellationKeys: defineTable({
    key: v.string(),
    notificationId: v.id("notifications"),
  }).index("by_key", ["key"]),
});
