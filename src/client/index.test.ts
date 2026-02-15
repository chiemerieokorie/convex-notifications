import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { anyApi, type ApiFromModules } from "convex/server";
import { mutationGeneric, queryGeneric } from "convex/server";
import { components, initConvexTest } from "./setup.test.js";
import { Notifications } from "./index.js";
import type { NotificationDefinition } from "./types.js";
import { v } from "convex/values";

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

// Test notification with HTML email (React Email pattern)
const htmlEmailDef: NotificationDefinition<{ userName: string }> = {
  event: "test.html-email",
  dataValidator: v.object({ userName: v.string() }),
  category: "testing",
  channels: {
    inbox: {
      title: (data) => `Welcome, ${data.userName}!`,
      body: () => "Thanks for joining.",
    },
    email: {
      subject: (data) => `Welcome, ${data.userName}`,
      body: (data) => `Hello ${data.userName}, welcome to the platform.`,
      html: (data) => `<h1>Welcome, ${data.userName}!</h1><p>Thanks for joining.</p>`,
    },
  },
};

// Test notification with async HTML email (simulating React Email render())
const asyncHtmlEmailDef: NotificationDefinition<{ userName: string }> = {
  event: "test.async-html-email",
  dataValidator: v.object({ userName: v.string() }),
  category: "testing",
  channels: {
    inbox: {
      title: (data) => `Hello, ${data.userName}`,
      body: () => "Async email test.",
    },
    email: {
      subject: (data) => `Hello ${data.userName}`,
      body: (data) => `Hello ${data.userName}`,
      html: async (data) => {
        // Simulates React Email's render() which returns a Promise
        return `<html><body><h1>Hello ${data.userName}</h1></body></html>`;
      },
    },
  },
};

// Use the new api() method for plug-and-play exports
export const {
  list,
  unreadCount,
  markRead,
  markAllRead,
  archive,
  getPreferences,
  updatePreference,
} = notifications.api();

// Push token management
export const registerPushToken = mutationGeneric({
  args: {
    token: v.string(),
    platform: v.optional(v.union(v.literal("ios"), v.literal("android"), v.literal("web"))),
    deviceId: v.optional(v.string()),
  },
  handler: (ctx, args) => notifications.registerPushToken(ctx, args),
});

export const getPushTokens = queryGeneric({
  args: {},
  returns: v.array(v.any()),
  handler: (ctx) => notifications.getPushTokens(ctx),
});

export const deletePushToken = mutationGeneric({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: (ctx, args) => notifications.deletePushToken(ctx, args.token),
});

// The send mutation is custom since it requires a notification definition
export const send = mutationGeneric({
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

export const getDeliveryLogs = queryGeneric({
  args: { notificationId: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.notifications.delivery.getDeliveryLogs, {
      notificationId: args.notificationId as string,
    });
  },
});

export const sendHtmlEmail = mutationGeneric({
  args: {
    userId: v.string(),
    data: v.object({ userName: v.string() }),
  },
  handler: (ctx, args) =>
    notifications.send(ctx, htmlEmailDef, {
      userId: args.userId,
      data: args.data,
    }),
});

export const sendAsyncHtmlEmail = mutationGeneric({
  args: {
    userId: v.string(),
    data: v.object({ userName: v.string() }),
  },
  handler: (ctx, args) =>
    notifications.send(ctx, asyncHtmlEmailDef, {
      userId: args.userId,
      data: args.data,
    }),
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
      registerPushToken: typeof registerPushToken;
      getPushTokens: typeof getPushTokens;
      deletePushToken: typeof deletePushToken;
      send: typeof send;
      getDeliveryLogs: typeof getDeliveryLogs;
      sendHtmlEmail: typeof sendHtmlEmail;
      sendAsyncHtmlEmail: typeof sendAsyncHtmlEmail;
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

    const result = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Hello, world!" },
    });
    expect(result.notificationId).toBeDefined();

    const listResult = await t.query(testApi.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(listResult.page).toHaveLength(1);
    expect(listResult.page[0].body).toBe("Hello, world!");
  });

  test("unread count decreases after markRead", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const result = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Test" },
    });

    expect(await t.query(testApi.unreadCount, {})).toBe(1);

    await t.mutation(testApi.markRead, { notificationId: result.notificationId });
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

    const sendResult = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Test" },
    });

    await t.mutation(testApi.archive, { notificationId: sendResult.notificationId });

    const result = await t.query(testApi.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(result.page).toHaveLength(0);
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
    const result = await t.mutation(testApi.send, {
      userId: "user1",
      data: { message: "Security alert" },
      transactional: true,
    });
    expect(result.notificationId).toBeDefined();

    // Notification was still created in inbox
    const listResult = await t.query(testApi.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(listResult.page).toHaveLength(1);
  });

  test("registerPushToken registers a new token", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const tokenId = await t.mutation(testApi.registerPushToken, {
      token: "ExponentPushToken[abc123]",
      platform: "ios",
    });
    expect(tokenId).toBeDefined();

    const tokens = await t.query(testApi.getPushTokens, {});
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).toBe("ExponentPushToken[abc123]");
    expect(tokens[0].platform).toBe("ios");
  });

  test("registerPushToken updates existing token", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    // Register first time
    const tokenId1 = await t.mutation(testApi.registerPushToken, {
      token: "ExponentPushToken[abc123]",
      platform: "ios",
    });

    // Register same token again with different platform
    const tokenId2 = await t.mutation(testApi.registerPushToken, {
      token: "ExponentPushToken[abc123]",
      platform: "android",
    });

    // Should be same ID (upserted)
    expect(tokenId2).toBe(tokenId1);

    // Should still only have one token
    const tokens = await t.query(testApi.getPushTokens, {});
    expect(tokens).toHaveLength(1);
    expect(tokens[0].platform).toBe("android");
  });

  test("registerPushToken with deviceId", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    await t.mutation(testApi.registerPushToken, {
      token: "ExponentPushToken[xyz789]",
      platform: "ios",
      deviceId: "device-123",
    });

    const tokens = await t.query(testApi.getPushTokens, {});
    expect(tokens).toHaveLength(1);
    expect(tokens[0].deviceId).toBe("device-123");
  });

  test("deletePushToken removes token", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    await t.mutation(testApi.registerPushToken, {
      token: "ExponentPushToken[abc123]",
    });

    const tokensBeforeDelete = await t.query(testApi.getPushTokens, {});
    expect(tokensBeforeDelete).toHaveLength(1);

    const deleted = await t.mutation(testApi.deletePushToken, {
      token: "ExponentPushToken[abc123]",
    });
    expect(deleted).toBe(true);

    const tokensAfterDelete = await t.query(testApi.getPushTokens, {});
    expect(tokensAfterDelete).toHaveLength(0);
  });

  test("deletePushToken returns false for non-existent token", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const deleted = await t.mutation(testApi.deletePushToken, {
      token: "NonExistentToken",
    });
    expect(deleted).toBe(false);
  });

  test("getPushTokens returns empty array for user with no tokens", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const tokens = await t.query(testApi.getPushTokens, {});
    expect(tokens).toHaveLength(0);
  });

  test("push tokens are user-scoped", async () => {
    const t1 = initConvexTest().withIdentity({ subject: "user1" });
    const t2 = initConvexTest().withIdentity({ subject: "user2" });

    await t1.mutation(testApi.registerPushToken, {
      token: "User1Token",
    });
    await t2.mutation(testApi.registerPushToken, {
      token: "User2Token",
    });

    const user1Tokens = await t1.query(testApi.getPushTokens, {});
    const user2Tokens = await t2.query(testApi.getPushTokens, {});

    expect(user1Tokens).toHaveLength(1);
    expect(user1Tokens[0].token).toBe("User1Token");

    expect(user2Tokens).toHaveLength(1);
    expect(user2Tokens[0].token).toBe("User2Token");
  });

  test("email with sync html field renders correctly", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const result = await t.mutation(testApi.sendHtmlEmail, {
      userId: "user1",
      data: { userName: "Alice" },
    });
    expect(result.notificationId).toBeDefined();

    // Notification should be in inbox with rendered title
    const listResult = await t.query(testApi.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(listResult.page).toHaveLength(1);
    expect(listResult.page[0].title).toBe("Welcome, Alice!");
    expect(listResult.page[0].body).toBe("Thanks for joining.");
  });

  test("email with async html field renders correctly", async () => {
    const t = initConvexTest().withIdentity({ subject: "user1" });

    const result = await t.mutation(testApi.sendAsyncHtmlEmail, {
      userId: "user1",
      data: { userName: "Bob" },
    });
    expect(result.notificationId).toBeDefined();

    // Notification should be in inbox
    const listResult = await t.query(testApi.list, { paginationOpts: { numItems: 20, cursor: null } });
    expect(listResult.page).toHaveLength(1);
    expect(listResult.page[0].title).toBe("Hello, Bob");
  });
});
