import { Router } from "express";
import { protect } from "../../middleware/auth.js";
import { submitContactForm, getTerms, getPrivacy } from "./settings.controller.js";

const router = Router();

router.get("/terms", getTerms);
router.get("/privacy", getPrivacy);
router.post("/contact", protect, submitContactForm);

export default router;
