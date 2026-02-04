import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initConvexTest } from "./setup.test";
import { internal } from "./_generated/api";

describe("delivery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("creates delivery log with externalId", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "pending",
      externalId: "resend_abc123",
      metadata: { to: "test@example.com" },
    });

    expect(deliveryLogId).toBeDefined();

    const logs = await t.query(internal.delivery.getDeliveryLogs, {
      notificationId,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].externalId).toBe("resend_abc123");
    expect(logs[0].channel).toBe("email");
    expect(logs[0].status).toBe("pending");
  });

  test("updates delivery status", async () => {
    const t = initConvexTest();
    const now = Date.now();
    vi.setSystemTime(now);

    const notificationId = await t.mutation(
      internal.notifications.createNotification,
      {
        userId: "user1",
        event: "test.event",
        title: "Test",
        body: "Test body",
      },
    );

    const deliveryLogId = await t.mutation(internal.delivery.createDeliveryLog, {
      notificationId,
      channel: "email",
      status: "pending",
    });

    await t.mutation(internal.delivery.updateDeliveryStatus, {
      deliveryLogId,
      status: "sent",
      sentAt: now,
    });

    const logs = await t.query(internal.delivery.getDeliveryLogs, {
      notificationId,
    });
    expect(logs[0].status).toBe("sent");
    expect(logs[0].sentAt).toBe(now);
  });

  describe("updateDeliveryFromWebhook", () => {
    test("updates delivery log by externalId", async () => {
      const t = initConvexTest();
      const now = Date.now();
      vi.setSystemTime(now);

      const notificationId = await t.mutation(
        internal.notifications.createNotification,
        {
          userId: "user1",
          event: "test.event",
          title: "Test",
          body: "Test body",
        },
      );

      await t.mutation(internal.delivery.createDeliveryLog, {
        notificationId,
        channel: "email",
        status: "pending",
        externalId: "resend_webhook_test",
      });

      const result = await t.mutation(internal.delivery.updateDeliveryFromWebhook, {
        externalId: "resend_webhook_test",
        channel: "email",
        status: "delivered",
        webhookData: { eventType: "email.delivered" },
      });

      expect(result).toBe(true);

      const logs = await t.query(internal.delivery.getDeliveryLogs, {
        notificationId,
      });
      expect(logs[0].status).toBe("delivered");
      expect(logs[0].sentAt).toBeDefined();
    });

    test("returns false for unknown externalId", async () => {
      const t = initConvexTest();

      const result = await t.mutation(internal.delivery.updateDeliveryFromWebhook, {
        externalId: "unknown_id",
        channel: "email",
        status: "delivered",
      });

      expect(result).toBe(false);
    });

    test("returns false for mismatched channel", async () => {
      const t = initConvexTest();
      const now = Date.now();
      vi.setSystemTime(now);

      const notificationId = await t.mutation(
        internal.notifications.createNotification,
        {
          userId: "user1",
          event: "test.event",
          title: "Test",
          body: "Test body",
        },
      );

      await t.mutation(internal.delivery.createDeliveryLog, {
        notificationId,
        channel: "email",
        status: "pending",
        externalId: "channel_mismatch_test",
      });

      // Try to update with wrong channel
      const result = await t.mutation(internal.delivery.updateDeliveryFromWebhook, {
        externalId: "channel_mismatch_test",
        channel: "sms", // Wrong channel
        status: "delivered",
      });

      expect(result).toBe(false);
    });

    test("preserves sentAt on subsequent updates", async () => {
      const t = initConvexTest();
      const now = Date.now();
      vi.setSystemTime(now);

      const notificationId = await t.mutation(
        internal.notifications.createNotification,
        {
          userId: "user1",
          event: "test.event",
          title: "Test",
          body: "Test body",
        },
      );

      await t.mutation(internal.delivery.createDeliveryLog, {
        notificationId,
        channel: "email",
        status: "pending",
        externalId: "preserve_sentat_test",
      });

      // First update - sent status
      await t.mutation(internal.delivery.updateDeliveryFromWebhook, {
        externalId: "preserve_sentat_test",
        channel: "email",
        status: "sent",
      });

      const logsAfterSent = await t.query(internal.delivery.getDeliveryLogs, {
        notificationId,
      });
      const originalSentAt = logsAfterSent[0].sentAt;
      expect(originalSentAt).toBeDefined();

      // Advance time
      vi.setSystemTime(now + 5000);

      // Second update - delivered status
      await t.mutation(internal.delivery.updateDeliveryFromWebhook, {
        externalId: "preserve_sentat_test",
        channel: "email",
        status: "delivered",
      });

      const logsAfterDelivered = await t.query(internal.delivery.getDeliveryLogs, {
        notificationId,
      });
      // sentAt should be preserved from first update
      expect(logsAfterDelivered[0].sentAt).toBe(originalSentAt);
      expect(logsAfterDelivered[0].status).toBe("delivered");
    });

    test("does not overwrite sentAt with undefined on failure", async () => {
      const t = initConvexTest();
      const now = Date.now();
      vi.setSystemTime(now);

      const notificationId = await t.mutation(
        internal.notifications.createNotification,
        {
          userId: "user1",
          event: "test.event",
          title: "Test",
          body: "Test body",
        },
      );

      await t.mutation(internal.delivery.createDeliveryLog, {
        notificationId,
        channel: "email",
        status: "pending",
        externalId: "failure_sentat_test",
      });

      // First update - sent
      await t.mutation(internal.delivery.updateDeliveryFromWebhook, {
        externalId: "failure_sentat_test",
        channel: "email",
        status: "sent",
      });

      const logsAfterSent = await t.query(internal.delivery.getDeliveryLogs, {
        notificationId,
      });
      const originalSentAt = logsAfterSent[0].sentAt;

      // Second update - failure (sentAt should not be overwritten)
      await t.mutation(internal.delivery.updateDeliveryFromWebhook, {
        externalId: "failure_sentat_test",
        channel: "email",
        status: "failed",
        error: "Bounce",
      });

      const logsAfterFailed = await t.query(internal.delivery.getDeliveryLogs, {
        notificationId,
      });
      // sentAt should still be preserved
      expect(logsAfterFailed[0].sentAt).toBe(originalSentAt);
      expect(logsAfterFailed[0].status).toBe("failed");
      expect(logsAfterFailed[0].error).toBe("Bounce");
    });

    test("stores webhook data in metadata", async () => {
      const t = initConvexTest();
      const now = Date.now();
      vi.setSystemTime(now);

      const notificationId = await t.mutation(
        internal.notifications.createNotification,
        {
          userId: "user1",
          event: "test.event",
          title: "Test",
          body: "Test body",
        },
      );

      await t.mutation(internal.delivery.createDeliveryLog, {
        notificationId,
        channel: "sms",
        status: "pending",
        externalId: "twilio_sm123",
        metadata: { originalData: "preserved" },
      });

      await t.mutation(internal.delivery.updateDeliveryFromWebhook, {
        externalId: "twilio_sm123",
        channel: "sms",
        status: "delivered",
        webhookData: {
          messageSid: "twilio_sm123",
          messageStatus: "delivered",
          to: "+1234567890",
        },
      });

      const logs = await t.query(internal.delivery.getDeliveryLogs, {
        notificationId,
      });

      const metadata = logs[0].metadata as {
        originalData: string;
        webhookData: object;
        webhookReceivedAt: number;
      };
      expect(metadata.originalData).toBe("preserved");
      expect(metadata.webhookData).toBeDefined();
      expect(metadata.webhookReceivedAt).toBeDefined();
    });
  });
});
