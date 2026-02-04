/**
 * Channel utilities for notification delivery.
 *
 * This module provides:
 * - Type definitions for rendered channel content
 * - Input validators for email, phone, and push tokens
 *
 * The actual channel dispatch is handled by the client adapters
 * which integrate with child components (Resend, Expo Push, Twilio).
 *
 * Usage:
 * ```ts
 * import {
 *   isValidEmail,
 *   isValidPhoneNumber,
 *   isValidPushToken,
 *   validateSmsBody,
 * } from "convex-notifications/channels";
 *
 * // Validate inputs before dispatch
 * if (!isValidEmail(email)) {
 *   throw new Error("Invalid email address");
 * }
 * ```
 */

// Types
export type {
  ChannelName,
  ChannelContent,
  DeliveryStatus,
  DispatchResult,
  RenderedEmail,
  RenderedPush,
  RenderedSms,
  RenderedContent,
} from "./types.js";

// Validators
export {
  isValidEmail,
  isValidPhoneNumber,
  isValidPushToken,
  validateSmsBody,
  formatPhoneE164,
} from "./validators.js";
