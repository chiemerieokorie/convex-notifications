import { defineComponent } from "convex/server";
import expoPush from "@convex-dev/expo-push-notifications/convex.config.js";
import resend from "@convex-dev/resend/convex.config.js";
import twilio from "@convex-dev/twilio/convex.config.js";

const component = defineComponent("notifications");

component.use(expoPush);
component.use(resend);
component.use(twilio);

export default component;
