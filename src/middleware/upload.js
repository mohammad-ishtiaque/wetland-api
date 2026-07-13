import multer from "multer";
import path from "path";
import fs from "fs";

// ─── Ensure uploads/avatars directory exists ───
const uploadDir = "uploads/avatars";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Storage configuration ───
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `avatar_${Date.now()}${ext}`;
        cb(null, uniqueName);
    },
});

// ─── File filter – images only ───
// image/svg+xml deliberately excluded: SVGs can embed <script> tags, and
// since uploads are served statically from /uploads, a direct navigation to
// an uploaded SVG (or an <object>/<iframe> embed of it) executes any script
// inside it in this server's origin — a real stored-XSS vector for
// user-uploaded avatars, not a theoretical one.
const fileFilter = (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/jpg", "image/bmp", "image/tiff", "image/avif"];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Only image files (jpeg, png, gif, webp, bmp, tiff, avif) are allowed"), false);
    }
};

export const avatarUpload = multer({
    storage,
    fileFilter,
    // 200MB was almost certainly a copy-paste/typo default, not a deliberate
    // choice for a profile picture — it lets one upload tie up disk space
    // and upload bandwidth disproportionately. 5MB comfortably covers any
    // real phone-camera photo used as an avatar.
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});
