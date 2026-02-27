import { Router } from "express";
import { protect } from "../../middleware/auth.js";
import {
  getStates,
  getCounties,
  getNearestStations,
  searchMoreStations,
  getStationsByCounty,
  reverseGeocodeEndpoint,
} from "./station.controller.js";

const router = Router();

// Public (for dropdowns)
router.get("/states", getStates);
router.get("/counties/:stateCode", getCounties);

// Protected
router.post("/nearest", protect, getNearestStations);
router.post("/search-more", protect, searchMoreStations);
router.post("/by-county", protect, getStationsByCounty);
router.post("/reverse-geocode", protect, reverseGeocodeEndpoint);

export default router;
