import { Router } from "express";
import { protect } from "../../middleware/auth.js";
import { getProfile, updateProfile, changePassword, updateAvatar } from "./user.controller.js";
import { avatarUpload } from "../../middleware/upload.js";

const router = Router();

router.use(protect);

router.route("/profile").get(getProfile).put(updateProfile);
router.put("/change-password", changePassword);
router.put("/avatar", avatarUpload.single("avatar"), updateAvatar);

export default router;

