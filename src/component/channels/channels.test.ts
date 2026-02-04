import { describe, test, expect } from "vitest";
import {
  isValidEmail,
  isValidPhoneNumber,
  isValidPushToken,
  validateSmsBody,
  formatPhoneE164,
} from "./validators.js";

describe("isValidEmail", () => {
  test("accepts valid email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user.name@example.com")).toBe(true);
    expect(isValidEmail("user+tag@example.com")).toBe(true);
    expect(isValidEmail("user@subdomain.example.com")).toBe(true);
    expect(isValidEmail("user@example.co.uk")).toBe(true);
  });

  test("rejects invalid email addresses", () => {
    expect(isValidEmail("invalid")).toBe(false);
    expect(isValidEmail("invalid@")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@.com")).toBe(false);
    expect(isValidEmail("user example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("isValidPhoneNumber", () => {
  test("accepts E.164 format phone numbers", () => {
    expect(isValidPhoneNumber("+15551234567")).toBe(true);
    expect(isValidPhoneNumber("+442071234567")).toBe(true);
    expect(isValidPhoneNumber("+8613812345678")).toBe(true);
  });

  test("accepts phone numbers without plus", () => {
    expect(isValidPhoneNumber("15551234567")).toBe(true);
    expect(isValidPhoneNumber("5551234567")).toBe(true);
  });

  test("accepts formatted phone numbers", () => {
    expect(isValidPhoneNumber("+1 (555) 123-4567")).toBe(true);
    expect(isValidPhoneNumber("(555) 123-4567")).toBe(true);
    expect(isValidPhoneNumber("555-123-4567")).toBe(true);
    expect(isValidPhoneNumber("555.123.4567")).toBe(true);
  });

  test("rejects invalid phone numbers", () => {
    expect(isValidPhoneNumber("123")).toBe(false);
    expect(isValidPhoneNumber("abc")).toBe(false);
    expect(isValidPhoneNumber("+0123456789")).toBe(false); // Can't start with 0
    expect(isValidPhoneNumber("")).toBe(false);
  });
});

describe("isValidPushToken", () => {
  test("accepts ExponentPushToken format", () => {
    expect(isValidPushToken("ExponentPushToken[abc123]")).toBe(true);
    expect(isValidPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
  });

  test("accepts ExpoPushToken format", () => {
    expect(isValidPushToken("ExpoPushToken[xyz789]")).toBe(true);
    expect(isValidPushToken("ExpoPushToken[abcdefghijklmnop]")).toBe(true);
  });

  test("rejects invalid push tokens", () => {
    expect(isValidPushToken("invalid-token")).toBe(false);
    expect(isValidPushToken("ExponentPushToken")).toBe(false);
    expect(isValidPushToken("ExponentPushToken[]")).toBe(false);
    expect(isValidPushToken("")).toBe(false);
    expect(isValidPushToken("fcm:token:here")).toBe(false);
  });
});

describe("validateSmsBody", () => {
  test("validates short SMS body", () => {
    const result = validateSmsBody("Hello, world!");
    expect(result.valid).toBe(true);
    expect(result.length).toBe(13);
    expect(result.segments).toBe(1);
  });

  test("validates SMS at exactly 160 characters", () => {
    const body = "x".repeat(160);
    const result = validateSmsBody(body);
    expect(result.valid).toBe(true);
    expect(result.segments).toBe(1);
  });

  test("validates multi-segment SMS", () => {
    const body = "x".repeat(320);
    const result = validateSmsBody(body);
    expect(result.valid).toBe(true);
    expect(result.segments).toBe(2);
  });

  test("validates SMS at max length", () => {
    const body = "x".repeat(1600);
    const result = validateSmsBody(body);
    expect(result.valid).toBe(true);
    expect(result.segments).toBe(10);
  });

  test("rejects SMS exceeding max length", () => {
    const body = "x".repeat(1601);
    const result = validateSmsBody(body);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds maximum length");
  });

  test("rejects empty SMS body", () => {
    const result = validateSmsBody("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("cannot be empty");
  });
});

describe("formatPhoneE164", () => {
  test("returns already formatted E.164 numbers", () => {
    expect(formatPhoneE164("+15551234567")).toBe("+15551234567");
    expect(formatPhoneE164("+442071234567")).toBe("+442071234567");
  });

  test("formats 10-digit US numbers with default country code", () => {
    expect(formatPhoneE164("5551234567")).toBe("+15551234567");
    expect(formatPhoneE164("5551234567", "1")).toBe("+15551234567");
  });

  test("formats 10-digit numbers with custom country code", () => {
    expect(formatPhoneE164("7911123456", "44")).toBe("+447911123456");
  });

  test("handles formatted input", () => {
    expect(formatPhoneE164("(555) 123-4567")).toBe("+15551234567");
    expect(formatPhoneE164("555-123-4567")).toBe("+15551234567");
    expect(formatPhoneE164("555.123.4567")).toBe("+15551234567");
  });

  test("returns null for invalid numbers", () => {
    expect(formatPhoneE164("123")).toBeNull();
    expect(formatPhoneE164("abc")).toBeNull();
    expect(formatPhoneE164("")).toBeNull();
  });

  test("handles numbers that already include country code", () => {
    expect(formatPhoneE164("15551234567")).toBe("+15551234567");
  });
});

describe("Channel type exports", () => {
  test("module loads correctly", async () => {
    // Verify that the types module can be imported
    const types = await import("./types.js");
    // Module should load without errors
    expect(types).toBeDefined();
  });
});
