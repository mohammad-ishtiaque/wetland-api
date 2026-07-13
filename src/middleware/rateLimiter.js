import rateLimit from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: "Too many requests, try again later" },
  // The RevenueCat webhook is exempt from this general per-IP limit: it's a
  // server-to-server endpoint (already gated by REVENUECAT_WEBHOOK_SECRET,
  // not end-user traffic) that can legitimately burst-deliver many events
  // in a short window — e.g. RevenueCat retrying a backlog after an outage,
  // or many users purchasing around a promo. It gets its own, more
  // generous limiter (webhookLimiter, applied directly on that route)
  // instead of silently dropping webhook deliveries as "too many requests."
  skip: (req) => req.path === "/v1/webhooks/revenuecat",
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many auth attempts, try again later" },
});

export const webhookLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 300,
  message: { success: false, message: "Too many webhook requests" },
});
