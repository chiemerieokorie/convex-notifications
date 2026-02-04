import { defineApp } from "convex/server";
import notifications from "convex-notifications/convex.config.js";

const app = defineApp();

// Register the main notifications component
app.use(notifications);

// To enable channel delivery, register the child components you need:
//
// import pushNotifications from "@convex-dev/expo-push-notifications/convex.config.js";
// import resend from "@convex-dev/resend/convex.config.js";
// import twilio from "@convex-dev/twilio/convex.config.js";
//
// app.use(pushNotifications);  // For mobile push notifications
// app.use(resend);             // For email delivery
// app.use(twilio);             // For SMS delivery

export default app;
