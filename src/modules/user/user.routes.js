import { Router } from "express";
import { protect } from "../../middleware/auth.js";
import { getProfile, updateProfile, changePassword, updateAvatar, logout } from "./user.controller.js";
import { avatarUpload } from "../../middleware/upload.js";

const router = Router();

router.use(protect);

router.route("/profile").get(getProfile).put(updateProfile);
router.put("/change-password", changePassword);
router.put("/avatar", avatarUpload.single("avatar"), updateAvatar);
router.post("/logout", logout);
    
export default router;
