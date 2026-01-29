# Convex Functions - Stripe Integration

This directory contains the Convex backend functions for Benji's Store,
demonstrating the `@convex-dev/stripe` component.

## Files

| File               | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `convex.config.ts` | Installs the @convex-dev/stripe component |
| `auth.config.ts`   | Configures Clerk authentication           |
| `http.ts`          | Registers Stripe webhook routes           |
| `schema.ts`        | Database schema (app-specific tables)     |
| `stripe.ts`        | Stripe actions and queries                |

## Quick Reference

### Setting Up the Component

```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import stripe from "@convex-dev/stripe/convex.config.js";

const app = defineApp();
app.use(stripe);

export default app;
```

### Creating the Client

```typescript
// convex/stripe.ts
import { components } from "./_generated/api";
import { StripeSubscriptions } from "@convex-dev/stripe";

const stripeClient = new StripeSubscriptions(components.stripe, {});
```

### Checkout Sessions

```typescript
// Subscription checkout
await stripeClient.createCheckoutSession(ctx, {
  priceId: "price_...",
  customerId: "cus_...",
  mode: "subscription",
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
  subscriptionMetadata: { userId: "user_123" },
});

// One-time payment checkout
await stripeClient.createCheckoutSession(ctx, {
  priceId: "price_...",
  customerId: "cus_...",
  mode: "payment",
  successUrl: "https://example.com/success",
  cancelUrl: "https://example.com/cancel",
  paymentIntentMetadata: { userId: "user_123" },
});
```

### Customer Management

```typescript
// Get or create a customer
const customer = await stripeClient.getOrCreateCustomer(ctx, {
  userId: identity.subject,
  email: identity.email,
  name: identity.name,
});

// Create customer portal session
const portal = await stripeClient.createCustomerPortalSession(ctx, {
  customerId: "cus_...",
  returnUrl: "https://example.com/profile",
});
```

### Subscription Management

```typescript
// Cancel subscription (at period end)
await stripeClient.cancelSubscription(ctx, {
  stripeSubscriptionId: "sub_...",
  cancelAtPeriodEnd: true, // false = cancel immediately
});

// Reactivate a subscription set to cancel
await stripeClient.reactivateSubscription(ctx, {
  stripeSubscriptionId: "sub_...",
});

// Update seat count
await stripeClient.updateSubscriptionQuantity(ctx, {
  stripeSubscriptionId: "sub_...",
  quantity: 5,
});
```

### Querying Data

```typescript
// List subscriptions for a user
const subs = await ctx.runQuery(
  components.stripe.public.listSubscriptionsByUserId,
  { userId: "user_123" },
);

// List payments for a user
const payments = await ctx.runQuery(
  components.stripe.public.listPaymentsByUserId,
  { userId: "user_123" },
);

// Get subscription by ID
const sub = await ctx.runQuery(components.stripe.public.getSubscription, {
  stripeSubscriptionId: "sub_...",
});

// List invoices for a customer
const invoices = await ctx.runQuery(components.stripe.public.listInvoices, {
  stripeCustomerId: "cus_...",
});

// List invoices for an organization
const orgInvoices = await ctx.runQuery(
  components.stripe.public.listInvoicesByOrgId,
  { orgId: "org_..." },
);
```

### Webhook Handling

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { registerRoutes } from "@convex-dev/stripe";

const http = httpRouter();

// Webhook URL will be: https://<deployment>.convex.site/stripe/webhook
registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  // Custom handlers for specific events
  events: {
    "customer.subscription.updated": async (ctx, event) => {
      console.log("Subscription updated:", event.data.object.id);
    },
  },
  // Called for ALL events
  onEvent: async (ctx, event) => {
    console.log("Event received:", event.type);
  },
});

export default http;
```

## Environment Variables

Set these in [Convex Dashboard](https://dashboard.convex.dev) → Settings →
Environment Variables:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:5173
```

The `APP_URL` is used for Stripe checkout success/cancel redirects.

## Component Tables

The `@convex-dev/stripe` component manages these tables:

- `stripe.customers` - Stripe customer records
- `stripe.subscriptions` - Subscription records with user/org linking
- `stripe.payments` - One-time payment records
- `stripe.invoices` - Invoice records

Access via `components.stripe.public.*` queries.

## Learn More

- [Component README](../../README.md)
- [Example App README](../README.md)
- [Convex Docs](https://docs.convex.dev)
- [Stripe Docs](https://stripe.com/docs)
