import { Router } from "express";
import { protect, adminOnly } from "../../middleware/auth.js";
import {
  calculate,
  calculateByLocation,
  saveEvaluation,
  getSavedEvaluations,
  getEvaluation,
  deleteEvaluation,
  getAllEvaluations,
} from "./evaluation.controller.js";

const router = Router();

// Public calculation (requires auth)
router.post("/calculate", protect, calculate);
router.post("/calculate-by-location", protect, calculateByLocation);

// Saved evaluations
router.post("/save", protect, saveEvaluation);
router.get("/saved", protect, getSavedEvaluations);
router.get("/:id", protect, getEvaluation);
router.delete("/:id", protect, deleteEvaluation);

// Admin
router.get("/admin/all", protect, adminOnly, getAllEvaluations);

export default router;

