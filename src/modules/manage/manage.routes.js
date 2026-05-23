import { Router } from "express";
import { protect, adminOnly } from "../../middleware/auth.js";
import {
  addTermsConditions,
  getTermsConditions,
  viewTermsConditions,
  deleteTermsConditions,
  addPrivacyPolicy,
  getPrivacyPolicy,
  viewPrivacyPolicy,
  deletePrivacyPolicy,
  addAboutUs,
  getAboutUs,
  deleteAboutUs,
  addFaq,
  updateFaq,
  getFaq,
  deleteFaq,
  addContactUs,
  getContactUs,
  deleteContactUs,
  addSupport,
  getSupport,
  getSupportById,
  updateSupportStatus,
  deleteSupport,
} from "./manage.controller.js";

const router = Router();
const adminMiddleware = [protect, adminOnly];

router.post("/add-terms-conditions", ...adminMiddleware, addTermsConditions);
router.get("/get-terms-conditions", getTermsConditions);
router.get("/view-terms-conditions", viewTermsConditions);
router.delete("/delete-terms-conditions", ...adminMiddleware, deleteTermsConditions);

router.post("/add-privacy-policy", ...adminMiddleware, addPrivacyPolicy);
router.get("/get-privacy-policy", getPrivacyPolicy);
router.get("/view-privacy-policy", viewPrivacyPolicy);
router.delete("/delete-privacy-policy", ...adminMiddleware, deletePrivacyPolicy);

router.post("/add-about-us", ...adminMiddleware, addAboutUs);
router.get("/get-about-us", getAboutUs);
router.delete("/delete-about-us", ...adminMiddleware, deleteAboutUs);

router.post("/add-faq", ...adminMiddleware, addFaq);
router.patch("/update-faq", ...adminMiddleware, updateFaq);
router.get("/get-faq", getFaq);
router.delete("/delete-faq", ...adminMiddleware, deleteFaq);

router.post("/add-contact-us", ...adminMiddleware, addContactUs);
router.get("/get-contact-us", getContactUs);
router.delete("/delete-contact-us", ...adminMiddleware, deleteContactUs);

router.post("/support", addSupport);
router.get("/support", ...adminMiddleware, getSupport);
router.get("/support/:id", ...adminMiddleware, getSupportById);
router.patch("/support/:id/status", ...adminMiddleware, updateSupportStatus);
router.delete("/support/:id", ...adminMiddleware, deleteSupport);

export default router;
