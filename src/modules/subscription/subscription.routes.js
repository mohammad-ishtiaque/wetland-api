import { Router } from "express";
import { protect, adminOnly } from "../../middleware/auth.js";
import { webhookLimiter } from "../../middleware/rateLimiter.js";
import {
  revenueCatWebhook,
  listSubscriptions,
  listTransactions,
} from "./subscription.controller.js";

const router = Router();

// Public — called by RevenueCat's servers, not the app. Authenticated via
// shared-secret header (REVENUECAT_WEBHOOK_SECRET), not JWT. Exempt from the
// general apiLimiter (see rateLimiter.js) and given its own more generous
// limit, since this is server-to-server traffic that can legitimately burst.
router.post("/webhooks/revenuecat", webhookLimiter, revenueCatWebhook);

// Admin — current status per user + transaction/event history
router.get("/admin/subscriptions", protect, adminOnly, listSubscriptions);
router.get("/admin/subscriptions/transactions", protect, adminOnly, listTransactions);

export default router;
