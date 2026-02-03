import { describe, test, expect, vi, beforeEach } from "vitest";
import { EmailAdapter, createEmailAdapter } from "./email.js";
import { PushAdapter, createPushAdapter } from "./push.js";
import { SmsAdapter, createSmsAdapter } from "./sms.js";
import {
  ChannelDispatcher,
  createDispatcher,
  getDefaultDispatcher,
} from "./dispatcher.js";

describe("EmailAdapter", () => {
  let adapter: EmailAdapter;

  beforeEach(() => {
    adapter = createEmailAdapter();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  test("has correct name", () => {
    expect(adapter.name).toBe("email");
  });

  test("dispatches valid email", async () => {
    const result = await adapter.dispatch("user@example.com", {
      subject: "Test Subject",
      body: "Test body content",
    });

    expect(result.status).toBe("sent");
    expect(result.error).toBeUndefined();
  });

  test("rejects invalid email address", async () => {
    const result = await adapter.dispatch("invalid-email", {
      subject: "Test",
      body: "Test",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Invalid email address");
  });

  test("accepts email with html", async () => {
    const result = await adapter.dispatch("user@example.com", {
      subject: "HTML Email",
      body: "Plain text",
      html: "<h1>HTML Content</h1>",
    });

    expect(result.status).toBe("sent");
  });
});

describe("PushAdapter", () => {
  let adapter: PushAdapter;

  beforeEach(() => {
    adapter = createPushAdapter();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  test("has correct name", () => {
    expect(adapter.name).toBe("push");
  });

  test("dispatches to valid Expo push token", async () => {
    const result = await adapter.dispatch("ExponentPushToken[abc123]", {
      title: "Test Title",
      body: "Test body",
    });

    expect(result.status).toBe("sent");
    expect(result.error).toBeUndefined();
  });

  test("dispatches to ExpoPushToken format", async () => {
    const result = await adapter.dispatch("ExpoPushToken[xyz789]", {
      title: "Test",
      body: "Test",
    });

    expect(result.status).toBe("sent");
  });

  test("rejects invalid push token", async () => {
    const result = await adapter.dispatch("invalid-token", {
      title: "Test",
      body: "Test",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Invalid Expo push token");
  });

  test("accepts push with data", async () => {
    const result = await adapter.dispatch("ExponentPushToken[abc]", {
      title: "Data Push",
      body: "With data",
      data: { action: "open_screen", screen: "profile" },
    });

    expect(result.status).toBe("sent");
  });
});

describe("SmsAdapter", () => {
  let adapter: SmsAdapter;

  beforeEach(() => {
    adapter = createSmsAdapter();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  test("has correct name", () => {
    expect(adapter.name).toBe("sms");
  });

  test("dispatches to valid phone number (E.164)", async () => {
    const result = await adapter.dispatch("+15551234567", {
      body: "Test SMS message",
    });

    expect(result.status).toBe("sent");
    expect(result.error).toBeUndefined();
  });

  test("dispatches to phone number without plus", async () => {
    const result = await adapter.dispatch("15551234567", {
      body: "Test SMS",
    });

    expect(result.status).toBe("sent");
  });

  test("dispatches to formatted phone number", async () => {
    const result = await adapter.dispatch("+1 (555) 123-4567", {
      body: "Test SMS",
    });

    expect(result.status).toBe("sent");
  });

  test("rejects invalid phone number", async () => {
    const result = await adapter.dispatch("123", {
      body: "Test",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Invalid phone number");
  });

  test("rejects SMS exceeding max length", async () => {
    const longBody = "x".repeat(1601);
    const result = await adapter.dispatch("+15551234567", {
      body: longBody,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("exceeds maximum length");
  });

  test("accepts SMS at max length", async () => {
    const maxBody = "x".repeat(1600);
    const result = await adapter.dispatch("+15551234567", {
      body: maxBody,
    });

    expect(result.status).toBe("sent");
  });
});

describe("ChannelDispatcher", () => {
  let dispatcher: ChannelDispatcher;

  beforeEach(() => {
    dispatcher = createDispatcher();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  test("isSupported returns true for email", () => {
    expect(dispatcher.isSupported("email")).toBe(true);
  });

  test("isSupported returns true for push", () => {
    expect(dispatcher.isSupported("push")).toBe(true);
  });

  test("isSupported returns true for sms", () => {
    expect(dispatcher.isSupported("sms")).toBe(true);
  });

  test("isSupported returns false for inbox", () => {
    expect(dispatcher.isSupported("inbox")).toBe(false);
  });

  test("isSupported returns false for unknown channel", () => {
    expect(dispatcher.isSupported("unknown")).toBe(false);
  });

  test("dispatches email via dispatcher", async () => {
    const result = await dispatcher.dispatch("email", "user@example.com", {
      subject: "Test",
      body: "Test body",
    });

    expect(result.status).toBe("sent");
  });

  test("dispatches push via dispatcher", async () => {
    const result = await dispatcher.dispatch("push", "ExponentPushToken[abc]", {
      title: "Test",
      body: "Test body",
    });

    expect(result.status).toBe("sent");
  });

  test("dispatches sms via dispatcher", async () => {
    const result = await dispatcher.dispatch("sms", "+15551234567", {
      body: "Test SMS",
    });

    expect(result.status).toBe("sent");
  });

  test("getAdapter returns correct adapter for each channel", () => {
    expect(dispatcher.getAdapter("email")).toBeInstanceOf(EmailAdapter);
    expect(dispatcher.getAdapter("push")).toBeInstanceOf(PushAdapter);
    expect(dispatcher.getAdapter("sms")).toBeInstanceOf(SmsAdapter);
    expect(dispatcher.getAdapter("inbox")).toBeNull();
  });
});

describe("getDefaultDispatcher", () => {
  test("returns a ChannelDispatcher instance", () => {
    const dispatcher = getDefaultDispatcher();
    expect(dispatcher).toBeInstanceOf(ChannelDispatcher);
  });

  test("returns the same instance on multiple calls", () => {
    const dispatcher1 = getDefaultDispatcher();
    const dispatcher2 = getDefaultDispatcher();
    expect(dispatcher1).toBe(dispatcher2);
  });
});

describe("createDispatcher with config", () => {
  test("creates dispatcher with email config", () => {
    const dispatcher = createDispatcher({
      email: {
        apiKey: "test-key",
        from: "noreply@example.com",
      },
    });

    expect(dispatcher).toBeInstanceOf(ChannelDispatcher);
  });

  test("creates dispatcher with push config", () => {
    const dispatcher = createDispatcher({
      push: {
        accessToken: "expo-token",
      },
    });

    expect(dispatcher).toBeInstanceOf(ChannelDispatcher);
  });

  test("creates dispatcher with sms config", () => {
    const dispatcher = createDispatcher({
      sms: {
        accountSid: "AC123",
        authToken: "auth456",
        from: "+15551234567",
      },
    });

    expect(dispatcher).toBeInstanceOf(ChannelDispatcher);
  });

  test("creates dispatcher with all configs", () => {
    const dispatcher = createDispatcher({
      email: { from: "noreply@example.com" },
      push: { accessToken: "token" },
      sms: { from: "+15551234567" },
    });

    expect(dispatcher).toBeInstanceOf(ChannelDispatcher);
    expect(dispatcher.isSupported("email")).toBe(true);
    expect(dispatcher.isSupported("push")).toBe(true);
    expect(dispatcher.isSupported("sms")).toBe(true);
  });
});
