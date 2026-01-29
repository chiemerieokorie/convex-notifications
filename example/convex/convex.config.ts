import { defineApp } from "convex/server";
import notifications from "convex-notifications/convex.config.js";

const app = defineApp();
app.use(notifications);

export default app;
