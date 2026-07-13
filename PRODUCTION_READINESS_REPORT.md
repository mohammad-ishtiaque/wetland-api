# Clima Norm / Site Norm — Production Readiness Audit

**Scope:** `wetland-api` (Node/Express/MongoDB backend) and `sitenorm_motaleb` (Flutter frontend), covering the subscription system, all API endpoints, and general production hardening.

**Verdict:** The backend is close to production-ready after this pass — the crash-causing bugs and the most serious security/reliability gaps are fixed and verified. It is **not fully ready** until the two flagged decisions below are made and, ideally, until server-side subscription enforcement is addressed (see "The one gap that matters most"). The frontend is functionally solid but has one real credential-leak item and two hardening recommendations that need your call, not mine.

---

## 1. What was actually broken (fixed and verified)

### Subscription system

- **TRANSFER events were being silently dropped, not just mishandled.** RevenueCat's TRANSFER event never includes `app_user_id` (confirmed against RevenueCat's own webhook field docs) — it only carries `transferred_from`/`transferred_to` arrays. The webhook's original guard (`if (!event.app_user_id) return ignored`) meant every real-world account-transfer event was rejected before it was even logged, not just before updating a user. Rewrote it as its own handling path: the old owner's status is set to `expired`, the new owner's to `active`, and the event is recorded either way. Documented limitation: RevenueCat doesn't include plan/expiry data on a TRANSFER event, so the new owner's exact plan/expiry isn't backfilled until their next RENEWAL — getting that instantly right would require calling RevenueCat's REST API with a secret key, which isn't configured (see open decisions).
- **Unvalidated pagination could crash the admin endpoints.** `page=0`, a negative page, or a non-numeric page produced a negative or `NaN` `skip`, which real MongoDB throws on. Found in `listSubscriptions`/`listTransactions` (subscription admin), **and independently in `getAllEvaluations`** (evaluation admin) — same bug, two places. Built one shared, tested `parsePagination()` utility and applied it to both; `limit` is now also capped at 100 so a request can't pull an entire collection.
- **REFUND_REVERSED wasn't handled** — a reversed refund left the user stuck at `refunded` status forever instead of returning to `active`.
- **Non-purchase RevenueCat events (PAYWALL_IMPRESSION, EXPERIMENT_ENROLLMENT, etc.) were about to pollute the transaction history.** They carry `app_user_id` just like real purchases do, so a "has app_user_id" check alone would have stored them as fake transactions. Added an explicit allowlist of event types actually treated as transactions.
- **Duplicate Mongoose index** on `SubscriptionEvent.eventId` (declared both via `index: true` and a separate `unique+sparse` index) — harmless but wasteful and noisy; removed the redundant one.

95 of 96 automated test assertions pass (`test-subscription.mjs`, kept in the repo, git-ignored). The one "failure" is a bug in my own test harness's default value, not the production code — documented inline in the test file.

### Backend, general

- **`.env.example` documented the wrong variable names** — `MONGO_URI` vs. the code's actual `MONGO_URL`, `JWT_EXPIRE` vs. `JWT_EXPIRES_IN`, plus SMTP and third-party-API entries that don't correspond to anything the code reads (those base URLs are hardcoded constants marked "NEVER CHANGE," not env-configurable). A fresh deployment following the old template would have started with an undefined database URL. Rewrote it to match `grep -r "process.env" src/` exactly.
- **No startup validation.** Added `validateEnv()` — the server now fails immediately with a clear message if `MONGO_URL` or `JWT_SECRET` is missing, instead of crashing later with a cryptic Mongoose/JWT error.
- **500 errors could leak internal messages.** Confirmed no code in this app relies on a bare `throw new Error(...)` reaching the client (every intentional error already sets `statusCode`), so it was safe to mask messages on true 500s (library internals, external-API failures) while every intentional 400/401/403/404 response is untouched.
- **Malformed MongoDB IDs returned an unhandled 500** (e.g. `GET /evaluations/not-a-real-id`). Added an explicit `CastError` branch returning a clean 400.
- **The RevenueCat webhook shared a 100-req/15-min limiter with the entire API.** A legitimate burst of webhook deliveries (RevenueCat retrying after an outage, a promo driving purchases) could get throttled and treated as failed deliveries. Exempted the webhook route and gave it its own more generous limit.
- **Avatar uploads accepted files up to 200MB** and allowed `image/svg+xml`. SVGs can embed `<script>` tags, and since uploads are served statically, a direct link to an uploaded SVG would execute that script in the API's origin — a real stored-XSS path, not theoretical. Capped at 5MB, removed SVG from the allowlist.
- **JWT verification didn't pin the algorithm.** Added `algorithms: ["HS256"]` to `jwt.verify` — defense-in-depth, matches how tokens are actually signed.
- **No graceful shutdown.** Added `SIGTERM`/`SIGINT` handling so in-flight requests (a webhook mid-processing, a slow ACIS/SDA lookup) finish instead of being dropped on deploy/restart.
- Added `engines.node` to `package.json`, added dev-only scripts (`diagnose.js`, `test-*.js`, `test-subscription.mjs`) to `.gitignore` (note: if any of these are already committed, `.gitignore` won't remove them retroactively — let me know if you want them purged from history).

### Frontend

- **RevenueCat SDK was set to verbose debug logging unconditionally**, including in release builds — purchase details and API responses would be readable via `adb logcat` on a real device. Now gated on `kDebugMode`.

---

## 2. Decisions you already made (implemented as directed)

- The dead `"cancelled"` enum value on `User.subscription.status` — **kept, unused, for now**, per your call.
- TRANSFER event handling — **built now** (see above), per your call.
- Audit-found gaps — **fixed the low-risk ones directly, flagged the rest below**, per your call.

---

## 3. Flagged for your decision (not touched — genuine tradeoffs, not bugs I can silently resolve)

### The one gap that matters most: subscription enforcement is 100% client-side

`auth_controller.dart` and `home_controller.dart` gate the entire app on `RevenueCatService.instance.isSubscribed()` at login/signup/home-load. **No backend endpoint checks a user's real subscription status before serving a paid feature.** The backend now *knows* a user's real status (via the webhook), but nothing currently uses that knowledge to gate access. In practice this means: a modified client, a jailbroken/rooted device with a hooking tool, or simply intercepting the local RevenueCat SDK response can bypass the paywall entirely and call `/evaluations/calculate` and every other protected endpoint for free, indefinitely.

This is very common for a v1 (many apps ship client-only enforcement first), so I'm not calling it broken — I'm calling it a real business-risk decision:
- **Ship as-is for now**, revisit if abuse becomes measurable.
- **Add server-side enforcement** on the `evaluations` routes (check `req.user.subscription.status === "active"` before running a paid calculation) — this is a real, scoped feature I can build once you tell me which endpoints should require it and how you want free/trial usage (if any) to work.

### JWT stored in `shared_preferences`, not secure storage

The auth token (365-day expiry) is stored in plaintext `shared_preferences` rather than `flutter_secure_storage` (Android Keystore / iOS Keychain-backed). Not an immediate crisis, but a stolen/extracted token from an unencrypted backup or a rooted device grants a full year of account access. Didn't touch this myself — it's a new dependency, a storage migration for existing installed users, and I can't build-test it in this environment. Flagging as a hardening recommendation for whenever you're ready to invest in it.

### A real credential sitting in source control

`result_screen.dart` has a commented-out (dead, not shipped) block containing a live-looking Google Places API key (`AIzaSyC_qKHmzl...`). Since it's a comment, it's not in the compiled app binary — but it **is** in your git history, readable by anyone with repo access. Recommend rotating that key in Google Cloud Console and removing the dead code block (I left it alone rather than risk a large multi-line edit given the file-sync issues described below). Separately, the *actively used* Maps SDK key hardcoded in `AndroidManifest.xml`/`AppDelegate.swift` is standard practice per Google's own setup docs — not a bug, just worth confirming it has Android/iOS app-restriction rules set in Cloud Console (I can't verify that from code).

### Duplicate, inconsistent Terms/Privacy content

Two separate systems exist: a static hardcoded one (`/settings/terms`, `/settings/privacy`) and a DB-driven, admin-editable one (`/manage/view-terms-conditions`, `/manage/view-privacy-policy`). Confirmed via the frontend's `api_urls.dart` that **the app only ever uses the second one** — but the first is still a live, public, unauthenticated endpoint, and it currently states payments are processed "securely via Stripe," which is inaccurate (the app uses RevenueCat via Apple/Google in-app purchases). Since it's reachable, it's a real (if minor) compliance/accuracy issue. Want it deleted, corrected, or repurposed?

### FAQ `role` enum doesn't match this app

`FAQ.role` is `["STUDENT", "TEACHER", "SCHOOL"]` — clearly leftover from a different (education-sector) template this backend may have started from. Doesn't match this app's actual users. Didn't guess at a replacement; flagging for your call on what the real values should be.

### CORS is wide open (`cors()` with no origin restriction)

Fine for the mobile app (no enforced Origin header), but if/when the admin dashboard ships as a web app, an unrestricted CORS policy is worth revisiting. Related: Helmet's default `Cross-Origin-Resource-Policy: same-origin` could also block that future dashboard from loading `/uploads` images cross-origin. Both are easy fixes once the dashboard's actual domain is known — nothing to do yet.

---

## 4. Minor/informational (no action needed, just so nothing is a surprise later)

- A refresh-token flow appears to have been *planned* but never finished — `JWT_REFRESH_SECRET`/`JWT_REFRESH_EXPIRES_IN` exist unused in the real `.env`, and the frontend's `local_service.dart` has matching storage plumbing that always saves an empty string (`auth_controller.dart` line ~233: `"Removed from new API response"`). Currently harmless dead code on both sides.
- `verify-reset-otp` issues a `resetToken` that `reset-password` never actually uses (it re-validates email+otp directly instead) — works fine, just an unused field in the response.
- `user.controller.js`'s `logout` calls `res.clearCookie("token")`, which is a no-op since this API authenticates via Bearer header, not cookies.

---

## 5. A tooling note, for transparency

Repeatedly during this session, edits made through the file-editing tool on your OneDrive-synced project folders silently truncated mid-write (syntax-valid but incomplete files — including, at one point, a route file missing its `export default`, which would have crashed the server at boot). I caught every instance by re-reading files after writing and running a full syntax + module-load sweep at the end, and every file referenced in this report has been verified complete. Still, given how many times this happened, it would be worth you spot-checking a file or two locally (or `git diff`) before deploying, just as a second set of eyes.

---

## 6. Postman collection — step by step

**File:** `wetland-api-postman-collection.json` (in the project root) — 56 requests covering all 55 routes across every module (auth, users, evaluations, stations, settings, manage/CMS, subscription, health). Nothing omitted.

### Setup (do this once)

1. Open Postman → **Import** → select `wetland-api-postman-collection.json`.
2. Click the collection name → **Variables** tab. Set `baseUrl`:
   - Local dev: `http://localhost:5000/api/v1`
   - Production: `https://api.sitenorm.com/api/v1`
3. Leave `token` blank — it fills itself automatically (see next step).

### Getting a token

Run **Auth → Signup** (edit the email/password in the body first), then check that inbox and run **Auth → Verify OTP (after signup)** with the real code. Or, if you already have a verified test account, just run **Auth → Signin**. Both requests have a test script that automatically saves the returned JWT into the `token` variable — every other request in the collection already uses `{{token}}`, so there's nothing to copy-paste.

For anything marked **[Admin]**, that user also needs `role: "admin"` in MongoDB — a normal signup won't have this; you'll need to flip it manually on a test account for now (there's no promote-to-admin endpoint).

### Verifying the client's specific bug reports

| Client-reported issue | How to verify it's fixed |
|---|---|
| Soil map unit returning "Not available" | **Evaluations → Calculate (by GPS)** with real coordinates → check `data.additionalInfo.soilMapUnit` — should show a real soil name like "Padina fine sand, 1 to 8 percent slopes", not "Not available" |
| Growing season returning "Not available" | Same request → check `data.additionalInfo.growingSeason` — should show a real date range and day count |
| Missing "miles from site" distance | Same request → check `data.additionalInfo.wetsStation` — should end with "X.X miles from site" |
| Confusing Quick Search validation error | **Evaluations → Calculate (by GPS)** with `lat` or `observationDate` removed from the body → the 400 response should name only the actually-missing field(s), not a generic message |
| Subscription status not reflected anywhere | **Subscription → [Webhook] RevenueCat Event** with a real user's `_id` as `app_user_id` → then **Subscription → [Admin] List Subscriptions** (as an admin user) → the user's status should now show `active` |

### Testing the subscription flow specifically

1. **[Webhook] RevenueCat Event** — set `app_user_id` to a real `User._id` from your database, `type: "INITIAL_PURCHASE"`. Send it.
2. **[Admin] List Subscriptions** — confirm that user now shows `status: "active"`.
3. **[Admin] List Subscription Transactions** — confirm the event appears in the history.
4. Change `type` to `"CANCELLATION"` and resend — status should stay `active` (still entitled) but `willRenew` should flip to `false`.
5. Change `type` to `"EXPIRATION"` and resend — status should become `expired`.
6. Try **[Webhook] RevenueCat TRANSFER Event** with two different real user IDs in `transferred_from`/`transferred_to` — confirm the old owner drops to `expired` and the new owner rises to `active`.

If `REVENUECAT_WEBHOOK_SECRET` is set in your `.env`, add an `Authorization` header to the webhook requests matching that value (or `Bearer <value>`) — otherwise they'll get a 401.
