import User from "../user/user.model.js";
import SubscriptionEvent from "./subscriptionEvent.model.js";

// ─────────────────────────────────────────────────
// Event types that mean "the user currently has active access."
// ─────────────────────────────────────────────────
const ACTIVE_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_PAUSED", // still technically entitled until expiration in RevenueCat's model
  "REFUND_REVERSED", // a prior refund was undone — access is restored
]);

// Every event type this module actually records as a "transaction." Anything
// outside this set (PAYWALL_IMPRESSION, PAYWALL_CLOSE, EXPERIMENT_ENROLLMENT,
// PRICE_INCREASE_CONSENT_*, SUBSCRIBER_ALIAS, VIRTUAL_CURRENCY_TRANSACTION,
// etc.) is acknowledged with 200 but NOT stored — those events DO carry
// app_user_id (so they'd otherwise slip past a naive "has app_user_id" check)
// but they aren't purchase/billing activity and don't belong in the admin
// transaction history. TRANSFER is intentionally excluded here — it's
// handled by its own code path before this set is ever consulted.
const TRACKED_EVENT_TYPES = new Set([
  ...ACTIVE_EVENT_TYPES,
  "CANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "REFUND",
  "TEST",
  "INVOICE_ISSUANCE", // billing activity worth keeping visible, even though it doesn't change status
]);

// Maps a RevenueCat event type to the status we store on User.subscription.
// CANCELLATION means "auto-renew turned off" in RevenueCat's model, NOT
// "access revoked" — the user keeps access until expiresAt, so we keep
// status "active" but flip willRenew to false. Only EXPIRATION actually
// ends access. This mirrors how RevenueCat itself expects integrators to
// treat these events — flagging it here since it's a real behavior choice,
// not an arbitrary one, in case product wants different handling later.
export function mapStatus(eventType) {
  if (ACTIVE_EVENT_TYPES.has(eventType)) return "active";
  if (eventType === "CANCELLATION") return "active"; // still entitled until expiration
  if (eventType === "EXPIRATION") return "expired";
  if (eventType === "BILLING_ISSUE") return "billing_issue";
  if (eventType === "REFUND") return "refunded";
  return null; // TRANSFER (handled separately), TEST, INVOICE_ISSUANCE, or
  // anything unrecognized (PAYWALL_*, EXPERIMENT_ENROLLMENT, etc.) — don't touch status
}

// Best-effort plan label from a RevenueCat product id, matching the
// product ids defined in the frontend's subscription_plan.dart. Falls back
// to null (shown as "—" in admin UI) rather than guessing wrong.
export function derivePlan(productId) {
  if (!productId) return null;
  const id = productId.toLowerCase();
  if (id.includes("year")) return "yearly";
  if (id.includes("month")) return "monthly";
  return null;
}

// Safely parse page/limit query params. Guards against page=0, negative
// values, non-numeric input (all of which would otherwise produce a
// negative or NaN `skip` and make MongoDB throw), and caps `limit` so a
// careless or malicious admin request can't ask for the entire collection
// in one page.
export function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

// ═══════════════════════════════════════════════════════════════
// TRANSFER events move entitlements from one App User ID to another.
// Per RevenueCat's official docs, TRANSFER events use the "Transfer fields"
// group, NOT "Subscriber identity fields" — meaning `app_user_id` is never
// present here, only `transferred_from` / `transferred_to` (both string
// arrays, always included). Handled as its own path so it never hits the
// generic app_user_id guard below (which would otherwise silently drop it).
//
// Data limitation, documented rather than silently guessed around: the
// TRANSFER payload does NOT include product_id, expiration_at_ms, or
// entitlement_ids, so we cannot know the destination user's plan/expiry
// from this event alone. We mark them "active" (they do now hold the
// entitlement — that much is certain from the event itself) without
// fabricating a plan or expiry date. The next RENEWAL/INITIAL_PURCHASE
// webhook backfills full details. Getting this exactly right at the moment
// of transfer would require calling RevenueCat's REST API
// (GET /subscribers/{app_user_id}) with a RevenueCat secret API key, which
// isn't configured yet (deferred by product decision).
// ═══════════════════════════════════════════════════════════════
async function handleTransferEvent(event, req, res) {
  const fromIds = Array.isArray(event.transferred_from) ? event.transferred_from : [];
  const toIds = Array.isArray(event.transferred_to) ? event.transferred_to : [];

  // Always record the raw event for audit, even if we can't resolve any user.
  try {
    await SubscriptionEvent.create({
      user: null,
      appUserId: toIds[0] || fromIds[0] || "unknown",
      eventType: event.type,
      eventId: event.id,
      store: event.store,
      environment: event.environment,
      resultingStatus: null,
      raw: req.body,
    });
  } catch (err) {
    if (err.code !== 11000) throw err; // duplicate delivery — already recorded
  }

  // Old owner(s) lose access — the entitlement was taken from them.
  for (const oldId of fromIds) {
    const oldUser = await User.findById(oldId).catch(() => null);
    if (oldUser && oldUser.subscription && oldUser.subscription.status !== "none") {
      oldUser.subscription.status = "expired";
      oldUser.subscription.willRenew = false;
      oldUser.subscription.updatedAt = new Date();
      await oldUser.save();
    }
  }

  // New owner(s) gain access (see data-limitation note above the function).
  for (const newId of toIds) {
    const newUser = await User.findById(newId).catch(() => null);
    if (newUser) {
      newUser.subscription.status = "active";
      newUser.subscription.willRenew = true;
      newUser.subscription.store = event.store || newUser.subscription.store || null;
      newUser.subscription.updatedAt = new Date();
      await newUser.save();
    }
  }

  return res.status(200).json({ success: true });
}

// ═══════════════════════════════════════════════════════════════
// POST /api/v1/webhooks/revenuecat
// Public route (no JWT) — authenticated via a shared-secret header
// configured on both RevenueCat's dashboard and our REVENUECAT_WEBHOOK_SECRET
// env var. Always responds 200 on anything we can parse, even for event
// types we don't act on, so RevenueCat doesn't retry unnecessarily.
// ═══════════════════════════════════════════════════════════════
export const revenueCatWebhook = async (req, res) => {
  try {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (secret) {
      const authHeader = req.headers.authorization || "";
      if (authHeader !== secret && authHeader !== `Bearer ${secret}`) {
        return res.status(401).json({ success: false, message: "Invalid webhook signature" });
      }
    }
    // If no secret is configured yet, we still accept events (so this can be
    // wired up and tested against a real RevenueCat dashboard before the
    // secret is generated) — but this should be set before going live.

    const event = req.body?.event;
    if (!event || !event.type) {
      // Acknowledge anyway — malformed/test payloads shouldn't cause retries
      return res.status(200).json({ success: true, message: "Ignored — no event" });
    }

    if (event.type === "TRANSFER") {
      return handleTransferEvent(event, req, res);
    }

    // Only process event types we actually understand as purchase/billing
    // activity (see TRACKED_EVENT_TYPES above). Everything else — including
    // types that DO carry app_user_id, like PAYWALL_IMPRESSION or
    // EXPERIMENT_ENROLLMENT — is acknowledged without being stored, so the
    // admin transaction list stays scoped to real subscription activity.
    if (!TRACKED_EVENT_TYPES.has(event.type) || !event.app_user_id) {
      return res.status(200).json({ success: true, message: `Ignored — event type ${event.type} not processed` });
    }

    const appUserId = String(event.app_user_id);
    const status = mapStatus(event.type);

    // app_user_id was set to our own User._id at RevenueCatService.init(userId)
    // in the frontend, so this should match directly in the common case.
    // Fallback to original_app_user_id per RevenueCat's own guidance ("when
    // looking up users from the webhook, search both app_user_id and
    // original_app_user_id") — covers the case where a purchase happened
    // under an anonymous SDK-generated ID before login and was later aliased.
    let user = await User.findById(appUserId).catch(() => null);
    if (!user && event.original_app_user_id && event.original_app_user_id !== appUserId) {
      user = await User.findById(event.original_app_user_id).catch(() => null);
    }

    const purchasedAt = event.purchased_at_ms ? new Date(event.purchased_at_ms) : null;
    const expirationAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

    // Record the raw event regardless of whether we recognize the user —
    // idempotent on event.id so RevenueCat's at-least-once delivery retries
    // don't create duplicates.
    try {
      await SubscriptionEvent.create({
        user: user?._id || null,
        appUserId,
        eventType: event.type,
        eventId: event.id,
        productId: event.product_id,
        entitlementIds: event.entitlement_ids || [],
        store: event.store,
        environment: event.environment,
        priceAmount: event.price ?? null,
        currency: event.currency ?? null,
        transactionId: event.transaction_id,
        originalTransactionId: event.original_transaction_id,
        purchasedAt,
        expirationAt,
        resultingStatus: status,
        raw: req.body,
      });
    } catch (err) {
      // Duplicate event.id (retry) — not an error, just skip re-recording
      if (err.code !== 11000) throw err;
    }

    if (user && status) {
      user.subscription = {
        status,
        plan: derivePlan(event.product_id),
        productId: event.product_id || user.subscription?.productId || null,
        entitlement: (event.entitlement_ids && event.entitlement_ids[0]) || user.subscription?.entitlement || null,
        store: event.store || user.subscription?.store || null,
        willRenew: event.type === "CANCELLATION" ? false : status === "active",
        purchasedAt: purchasedAt || user.subscription?.purchasedAt || null,
        expiresAt: expirationAt || user.subscription?.expiresAt || null,
        transactionId: event.transaction_id || user.subscription?.transactionId || null,
        updatedAt: new Date(),
      };
      await user.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    // A real server error SHOULD cause RevenueCat to retry, so this is a 500.
    console.error("RevenueCat webhook error:", error.message);
    res.status(500).json({ success: false, message: "Webhook processing error" });
  }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/v1/admin/subscriptions
// Admin: current subscription status per user (paginated, filterable)
// ═══════════════════════════════════════════════════════════════
export const listSubscriptions = async (req, res, next) => {
  try {
    const { status } = req.query;
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });

    const filter = {};
    if (status) filter["subscription.status"] = status;
    else filter["subscription.status"] = { $ne: "none" }; // default: only users with any subscription history

    const users = await User.find(filter)
      .select("name email subscription createdAt")
      .sort({ "subscription.updatedAt": -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    const stats = await User.aggregate([
      { $match: { "subscription.status": { $ne: "none" } } },
      { $group: { _id: "$subscription.status", count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: {
        subscribers: users,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        stats: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════
// GET /api/v1/admin/subscriptions/transactions
// Admin: transaction/event history list — date, plan, amount, store, status.
// Optional ?userId= to scope to one user.
// ═══════════════════════════════════════════════════════════════
export const listTransactions = async (req, res, next) => {
  try {
    const { userId, eventType } = req.query;
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30 });

    const filter = {};
    if (userId) filter.user = userId;
    if (eventType) filter.eventType = eventType;

    const events = await SubscriptionEvent.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SubscriptionEvent.countDocuments(filter);

    res.json({
      success: true,
      data: {
        transactions: events.map((e) => ({
          id: e._id,
          user: e.user ? { id: e.user._id, name: e.user.name, email: e.user.email } : null,
          appUserId: e.appUserId,
          eventType: e.eventType,
          plan: derivePlan(e.productId),
          productId: e.productId,
          store: e.store,
          amount: e.priceAmount,
          currency: e.currency,
          status: e.resultingStatus,
          purchasedAt: e.purchasedAt,
          expirationAt: e.expirationAt,
          transactionId: e.transactionId,
          date: e.createdAt,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    next(error);
  }
};
