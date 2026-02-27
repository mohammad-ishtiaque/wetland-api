import User from "../user/user.model.js";
import { sendOTPEmail } from "../../utils/email.js";

// ─── POST /api/v1/auth/signup ───
export const signup = async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const user = await User.create({ name, email, password });

    // Generate and send OTP
    const otp = user.generateOTP();
    await user.save();
    await sendOTPEmail(email, otp);

    res.status(201).json({
      success: true,
      message: "Account created. Verification code sent to your email.",
      data: { userId: user._id, email: user.email },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/auth/verify-otp ───
export const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({
      email,
      otp,
      otpExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = user.generateToken();

    res.json({
      success: true,
      message: "Email verified successfully",
      data: {
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/auth/resend-otp ───
export const resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const otp = user.generateOTP();
    await user.save();
    await sendOTPEmail(email, otp);

    res.json({ success: true, message: "New verification code sent" });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/auth/signin ───
export const signin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      // Resend OTP automatically
      const otp = user.generateOTP();
      await user.save();
      await sendOTPEmail(email, otp);

      return res.status(403).json({
        success: false,
        message: "Email not verified. New verification code sent.",
        data: { requiresVerification: true, email },
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = user.generateToken();

    res.json({
      success: true,
      data: {
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/auth/forgot-password ───
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: "No account with that email" });
    }

    const otp = user.generateResetOTP();
    await user.save();
    await sendOTPEmail(email, otp);

    res.json({
      success: true,
      message: "Password reset code sent to your email",
      data: { email },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/auth/verify-reset-otp ───
export const verifyResetOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({
      email,
      resetOtp: otp,
      resetOtpExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired code" });
    }

    // Generate a temporary reset token
    const resetToken = user.generateToken();

    res.json({
      success: true,
      message: "Code verified. You can now reset your password.",
      data: { resetToken },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/auth/reset-password ───
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({
      email,
      resetOtp: otp,
      resetOtpExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset code" });
    }

    user.password = newPassword;
    user.resetOtp = undefined;
    user.resetOtpExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};
