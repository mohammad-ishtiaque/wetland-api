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
const fileFilter = (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/jpg", "image/bmp", "image/tiff", "image/svg+xml", "image/avif"];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Only image files (jpeg, png, gif, webp) are allowed"), false);
    }
};

export const avatarUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});
