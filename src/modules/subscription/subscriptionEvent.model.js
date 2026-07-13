import mongoose from "mongoose";

// ─────────────────────────────────────────────────
// One document per RevenueCat webhook event received.
// This is the raw transaction/event history — the source for the admin
// "transaction history list" (date, plan, amount, store, status per user).
// We store every event we get, even ones we don't actively act on, so
// nothing is silently lost if we need to re-derive status later.
// ─────────────────────────────────────────────────
const subscriptionEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null, // null if app_user_id didn't match any known user
    },
    appUserId: { type: String, required: true, index: true }, // RevenueCat app_user_id (== our User._id as a string, by design)

    eventType: { type: String, required: true, index: true }, // INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE, REFUND, etc.
    eventId: String, // RevenueCat's own event id, for idempotency — indexed below (unique+sparse)

    productId: String,
    entitlementIds: [String],
    store: String, // APP_STORE, PLAY_STORE, STRIPE, etc.
    environment: String, // SANDBOX or PRODUCTION

    priceAmount: Number, // in the currency below (RevenueCat sends this as a decimal, e.g. 9.99)
    currency: String,

    transactionId: String,
    originalTransactionId: String,

    purchasedAt: Date,
    expirationAt: Date,

    // Snapshot of what we derived the user's status to be as a result of
    // this event, for easy display alongside the raw event in the admin UI.
    resultingStatus: String,

    raw: { type: mongoose.Schema.Types.Mixed }, // full original webhook payload, for debugging/audit
  },
  { timestamps: true }
);

// Prevent double-processing if RevenueCat retries a webhook delivery
subscriptionEventSchema.index({ eventId: 1 }, { unique: true, sparse: true });

export default mongoose.model("SubscriptionEvent", subscriptionEventSchema);
