import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./config/database.js";
import { validateEnv } from "./config/validateEnv.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { apiLimiter } from "./middleware/rateLimiter.js";

// Route imports
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import evaluationRoutes from "./modules/evaluation/evaluation.routes.js";
import stationRoutes from "./modules/station/station.routes.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import manageRoutes from "./modules/manage/manage.routes.js";
import subscriptionRoutes from "./modules/subscription/subscription.routes.js";

dotenv.config();
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─── MIDDLEWARE ───
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use("/api", apiLimiter);

// ─── STATIC FILES (uploaded avatars etc.) ───
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ─── ROUTES ───
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/evaluations", evaluationRoutes);
app.use("/api/v1/stations", stationRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/manage", manageRoutes);
app.use("/api/v1", subscriptionRoutes); // defines its own full sub-paths: /webhooks/revenuecat, /admin/subscriptions...


// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── ERROR HANDLING ───
app.use(notFound);
app.use(errorHandler);

// ─── START SERVER ───
const PORT = process.env.PORT || 5000;
const HOST = process.env.BASE_URL || "localhost";

const start = async () => {
  await connectDB();
  const server = app.listen(PORT, HOST, () => {
    console.log(`Clima Norm API running on http://${HOST}:${PORT}`);
  });

  // Graceful shutdown — let in-flight requests finish (e.g. a webhook mid-
  // processing, or a slow ACIS/SDA lookup) instead of dropping connections
  // when the host platform sends SIGTERM during a deploy/restart.
  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
    // Don't hang forever if something never finishes
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start();

export default app;
