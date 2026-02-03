import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { anyApi, type ApiFromModules } from "convex/server";
import { components, initConvexTest } from "./setup.test.js";
import { Notifications } from "./index.js";
import type { NotificationDefinition } from "./types.js";
import { v } from "convex/values";
import { query, mutation } from "../component/_generated/server.js";

// Instantiate class
const notifications = new Notifications(components.notifications, {
  auth: async (ctx) => {
    return (await ctx.auth.getUserIdentity())?.subject ?? "anonymous";
  },
});

// Test notification definition
const testEventDef: NotificationDefinition<{ message: string }> = {
  event: "test.event",
  dataValidator: v.object({ message: v.string() }),
  category: "testing",
  channels: {
    inbox: {
      title: () => "Test Notification",
      body: (data) => data.message,
    },
    email: {
      subject: () => "Test Email",
      body: (data) => data.message,
    },
  },
};

// Exported query/mutation wrappers (same pattern as example app)
export const list = query({
  args: { limit: v.optional(v.number()), cursor: v.optional(v.number()) },
  handler: (ctx, args) => notifications.list(ctx, args),
});

export const unreadCount = query({
  args: {},
  handler: (ctx) => notifications.unreadCount(ctx),
});

export const markRead = mutation({
  args: { notificationId: v.string() },
  handler: (ctx, args) => notifications.markRead(ctx, args.notificationId),
});

export const markAllRead = mutation({
  args: {},
  handler: (ctx) => notifications.markAllRead(ctx),
});

export const archive = mutation({
  args: { notificationId: v.string() },
  handler: (ctx, args) => notifications.archive(ctx, args.notificationId),
});

export const getPreferences = query({
  args: {},
  handler: (ctx) => notifications.getPreferences(ctx),
});

export const updatePreference = mutation({
  args: {
    level: v.union(
      v.literal("global"),
      v.literal("category"),
      v.literal("event"),
    ),
    key: v.optional(v.string()),
    channel: v.string(),
    enabled: v.boolean(),
  },
  handler: (ctx, args) => notifications.updatePreference(ctx, args),
});

export const send = mutation({
  args: {
    userId: v.string(),
    data: v.any(),
    transactional: v.optional(v.boolean()),
    deduplicationKey: v.optional(v.string()),
    deduplicationTtlSeconds: v.optional(v.number()),
  },
  handler: (ctx, args) =>
    notifications.send(ctx, testEventDef, {
      userId: args.userId,
      data: args.data as { message: string },
      transactional: args.transactional,
      deduplicationKey: args.deduplicationKey,
      deduplicationTtlSeconds: args.deduplicationTtlSeconds,
    }),
});

export const getDeliveryLogs = query({
  args: { notificationId: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.notifications.delivery.getDeliveryLogs, {
      notificationId: args.notificationId as any,
    });
  },
});

const testApi = (
  anyApi as unknown as ApiFromModules<{
    "index.test": {
      list: typeof list;
      unreadCount: typeof unreadCount;
      markRead: typeof markRead;
      markAllRead: typeof markAllRead;
      archive: typeof archive;
      getPreferences: typeof getPreferences;
      updatePreference: typeof updatePreference;
      send: typeof send;
      getDeliveryLogs: typeof getDeliveryLogs;
    };
  }>
)["index.test"];

describe("client integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("send and list notifications", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const notificationId = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Hello, world!" },
    });
    expect(notificationId).toBeDefined();

    const result = await t.query(testApi.list, {});
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].body).toBe("Hello, world!");
  });

  test("unread count decreases after markRead", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const notificationId = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Test" },
    });

    expect(await t.query(testApi.unreadCount, {})).toBe(1);

    await t.mutation(testApi.markRead, { notificationId });
    expect(await t.query(testApi.unreadCount, {})).toBe(0);
  });

  test("markAllRead clears unread count", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "One" },
    });
    await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Two" },
    });

    expect(await t.query(testApi.unreadCount, {})).toBe(2);

    await t.mutation(testApi.markAllRead, {});
    expect(await t.query(testApi.unreadCount, {})).toBe(0);
  });

  test("archive removes from list", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const notificationId = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Test" },
    });

    await t.mutation(testApi.archive, { notificationId });

    const result = await t.query(testApi.list, {});
    expect(result.notifications).toHaveLength(0);
  });

  test("preferences CRUD", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    await t.mutation(testApi.updatePreference, {
      level: "global",
      channel: "email",
      enabled: false,
    });

    const prefs = await t.query(testApi.getPreferences, {});
    expect(prefs).toHaveLength(1);
    expect(prefs[0].channel).toBe("email");
    expect(prefs[0].enabled).toBe(false);
  });

  test("deduplication prevents duplicate sends", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "First" },
      deduplicationKey: "unique-key",
    });

    await expect(
      t.mutation(testApi.send, {
        userId: "user1",
        data: { message: "Duplicate" },
        deduplicationKey: "unique-key",
      }),
    ).rejects.toThrow("Duplicate notification suppressed");
  });

  test("transactional bypasses preferences", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    // Disable all channels globally
    await t.mutation(testApi.updatePreference, {
      level: "global",
      channel: "inbox",
      enabled: false,
    });
    await t.mutation(testApi.updatePreference, {
      level: "global",
      channel: "email",
      enabled: false,
    });

    // Transactional still creates the notification
    const id = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Security alert" },
      transactional: true,
    });
    expect(id).toBeDefined();

    // Notification was still created in inbox
    const result = await t.query(testApi.list, {});
    expect(result.notifications).toHaveLength(1);
  });

  test("delivery status updates to sent after dispatch", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const notificationId = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Hello!" },
    });

    // Delivery logs should be created and updated to "sent"
    const logs = await t.query(testApi.getDeliveryLogs, { notificationId });

    expect(logs).toHaveLength(1);
    expect(logs[0].channel).toBe("email");
    expect(logs[0].status).toBe("sent");
    expect(logs[0].sentAt).toBeDefined();
    expect(logs[0].metadata).toEqual({
      subject: "Test Email",
      body: "Hello!",
    });
  });
});
