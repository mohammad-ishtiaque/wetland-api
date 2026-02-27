import { Router } from "express";
import { authLimiter } from "../../middleware/rateLimiter.js";
import {
  signup,
  signin,
  verifyOTP,
  resendOTP,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
} from "./auth.controller.js";

const router = Router();

router.use(authLimiter);

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOTP);
router.post("/reset-password", resetPassword);

export default router;
