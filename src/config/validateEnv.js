// Fails fast, loudly, and clearly if required configuration is missing —
// instead of letting the app crash later with a cryptic error deep inside
// Mongoose or jsonwebtoken (e.g. mongoose.connect(undefined), or
// jwt.sign(payload, undefined) throwing mid-request). This exists because
// the .env.example template previously documented the WRONG variable names
// (MONGO_URI vs the code's actual MONGO_URL, JWT_EXPIRE vs JWT_EXPIRES_IN) —
// a fresh deployment following the old template would have silently
// started with an undefined MONGO_URL and failed in a confusing way.
const REQUIRED_ENV_VARS = ["MONGO_URL", "JWT_SECRET"];

// Missing these won't stop the server from starting, but specific features
// will fail at request time (OTP/password-reset emails won't send). Warn
// so it's caught in a deploy log rather than discovered via a support ticket.
const RECOMMENDED_ENV_VARS = ["SMTP_SERVICE", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"];

export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`\n❌ Missing required environment variable(s): ${missing.join(", ")}`);
    console.error(`   Check your .env file against .env.example, and confirm the variable names match exactly.\n`);
    process.exit(1);
  }

  const missingRecommended = RECOMMENDED_ENV_VARS.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(`⚠️  Missing recommended environment variable(s): ${missingRecommended.join(", ")} — OTP/password-reset emails will fail until these are set.`);
  }

  if (!process.env.REVENUECAT_WEBHOOK_SECRET) {
    console.warn(`⚠️  REVENUECAT_WEBHOOK_SECRET is not set — the RevenueCat webhook endpoint will accept UNAUTHENTICATED requests. Set this before going live.`);
  }
}
