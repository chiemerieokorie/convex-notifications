/**
 * Input validation utilities for notification channels.
 *
 * These validators ensure addresses and content meet channel requirements
 * before dispatch attempts.
 */

/**
 * Validate email address format.
 * Uses a practical regex that covers most valid email formats.
 *
 * @param email - Email address to validate
 * @returns true if the email format is valid
 */
export function isValidEmail(email: string): boolean {
  // RFC 5322 simplified regex - practical for most use cases
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format.
 * Accepts E.164 format (+1234567890) or common variations with 10-15 digits.
 *
 * @param phone - Phone number to validate
 * @returns true if the phone format is valid
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Remove common formatting characters
  const cleaned = phone.replace(/[\s\-().]/g, "");
  // Check for E.164 format or 10+ digit number
  return /^\+?[1-9]\d{9,14}$/.test(cleaned);
}

/**
 * Validate Expo push token format.
 * Accepts ExponentPushToken[...] or ExpoPushToken[...] formats.
 *
 * @param token - Push token to validate
 * @returns true if the token format is valid
 */
export function isValidPushToken(token: string): boolean {
  // Expo push token format
  return /^Expo(nent)?PushToken\[.+\]$/.test(token);
}

/**
 * Validate SMS body length.
 * Standard SMS is 160 chars, concatenated messages up to 1600 chars.
 *
 * @param body - SMS body text
 * @returns Object with validation result and segment count
 */
export function validateSmsBody(body: string): {
  valid: boolean;
  length: number;
  segments: number;
  error?: string;
} {
  const length = body.length;
  const segments = Math.ceil(length / 160);

  if (length === 0) {
    return {
      valid: false,
      length,
      segments: 0,
      error: "SMS body cannot be empty",
    };
  }

  if (length > 1600) {
    return {
      valid: false,
      length,
      segments,
      error: `SMS body exceeds maximum length of 1600 characters (got ${length})`,
    };
  }

  return { valid: true, length, segments };
}

/**
 * Format phone number to E.164 format if possible.
 * Returns null if the phone number cannot be formatted.
 *
 * @param phone - Phone number to format
 * @param defaultCountryCode - Default country code if not provided (e.g., "1" for US)
 * @returns E.164 formatted phone number or null
 */
export function formatPhoneE164(
  phone: string,
  defaultCountryCode?: string,
): string | null {
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, "");

  // Already in E.164 format
  if (cleaned.startsWith("+") && cleaned.length >= 11 && cleaned.length <= 16) {
    return cleaned;
  }

  // Try adding default country code
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    const countryCode = defaultCountryCode ?? "1";
    // If it starts with the country code, use as-is
    if (digits.startsWith(countryCode) && digits.length >= 11) {
      return `+${digits}`;
    }
    // Add country code
    if (digits.length === 10) {
      return `+${countryCode}${digits}`;
    }
  }

  return null;
}
