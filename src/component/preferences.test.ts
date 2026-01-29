import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("preferences", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("defaults to all channels enabled", async () => {
    const t = initConvexTest();
    const enabled = await t.query(internal.preferences.resolvePreferences, {
      userId: "user1",
      event: "any.event",
      channels: ["inbox", "email", "push", "sms"],
    });
    expect(enabled).toEqual(["inbox", "email", "push", "sms"]);
  });

  test("global preference disables channel", async () => {
    const t = initConvexTest();
    await t.mutation(internal.preferences.updatePreference, {
      userId: "user1",
      level: "global",
      channel: "email",
      enabled: false,
    });

    const enabled = await t.query(internal.preferences.resolvePreferences, {
      userId: "user1",
      event: "any.event",
      channels: ["email", "push"],
    });
    expect(enabled).toEqual(["push"]);
  });

  test("category overrides global", async () => {
    const t = initConvexTest();
    // Disable email globally
    await t.mutation(internal.preferences.updatePreference, {
      userId: "user1",
      level: "global",
      channel: "email",
      enabled: false,
    });
    // Enable email for social category
    await t.mutation(internal.preferences.updatePreference, {
      userId: "user1",
      level: "category",
      key: "social",
      channel: "email",
      enabled: true,
    });

    const enabled = await t.query(internal.preferences.resolvePreferences, {
      userId: "user1",
      event: "comment.reply",
      category: "social",
      channels: ["email"],
    });
    expect(enabled).toEqual(["email"]);
  });

  test("event overrides category and global", async () => {
    const t = initConvexTest();
    // Enable email for social category
    await t.mutation(internal.preferences.updatePreference, {
      userId: "user1",
      level: "category",
      key: "social",
      channel: "email",
      enabled: true,
    });
    // Disable email for specific event
    await t.mutation(internal.preferences.updatePreference, {
      userId: "user1",
      level: "event",
      key: "comment.reply",
      channel: "email",
      enabled: false,
    });

    const enabled = await t.query(internal.preferences.resolvePreferences, {
      userId: "user1",
      event: "comment.reply",
      category: "social",
      channels: ["email"],
    });
    expect(enabled).toEqual([]);
  });

  test("upserts existing preference", async () => {
    const t = initConvexTest();
    await t.mutation(internal.preferences.updatePreference, {
      userId: "user1",
      level: "global",
      channel: "email",
      enabled: false,
    });
    await t.mutation(internal.preferences.updatePreference, {
      userId: "user1",
      level: "global",
      channel: "email",
      enabled: true,
    });

    const prefs = await t.query(internal.preferences.getPreferences, {
      userId: "user1",
    });
    expect(prefs).toHaveLength(1);
    expect(prefs[0].enabled).toBe(true);
  });

  test("different users have independent preferences", async () => {
    const t = initConvexTest();
    await t.mutation(internal.preferences.updatePreference, {
      userId: "user1",
      level: "global",
      channel: "email",
      enabled: false,
    });

    const enabled = await t.query(internal.preferences.resolvePreferences, {
      userId: "user2",
      event: "any.event",
      channels: ["email"],
    });
    expect(enabled).toEqual(["email"]); // user2 has no prefs, defaults to enabled
  });
});
