import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },

    // OTP fields
    otp: String,
    otpExpires: Date,

    // Password reset
    resetOtp: String,
    resetOtpExpires: Date,

    // Profile
    avatar: String,
    lastLogin: Date,

    // ─────────────────────────────────────────────────
    // Subscription snapshot (fed by the RevenueCat webhook — see
    // src/modules/subscription/). This is a point-in-time snapshot for
    // fast admin queries; SubscriptionEvent holds the full history.
    // This does NOT gate API access yet — recording only, per current
    // scope. See subscription.controller.js for status-mapping logic.
    // ─────────────────────────────────────────────────
    subscription: {
      status: {
        type: String,
        enum: ["none", "active", "cancelled", "expired", "billing_issue", "refunded"],
        default: "none",
      },
      plan: { type: String, default: null }, // e.g. "monthly", "yearly" (derived from productId)
      productId: { type: String, default: null },
      entitlement: { type: String, default: null }, // e.g. "sitenorm Pro"
      store: { type: String, default: null }, // APP_STORE, PLAY_STORE, STRIPE, etc.
      willRenew: { type: Boolean, default: false },
      purchasedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      transactionId: { type: String, default: null },
      updatedAt: { type: Date, default: null }, // last time a webhook event touched this
    },
  },
  { timestamps: true }
);


// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Generate JWT
userSchema.methods.generateToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "365d",
  });
};
// Generate 6-digit OTP
userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  return otp;
};

userSchema.methods.generateResetOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.resetOtp = otp;
  this.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
  return otp;
};

export default mongoose.model("User", userSchema);
