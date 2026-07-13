import Evaluation from "./evaluation.model.js";
import {
  findStationsByBBox,
  findStationsByCounty,
  getMonthlyPrecipitation,
  getWetsData,
  getGrowingSeasonData,
  findNearestValidStations,
  averageWetsData,
  averageMultiStationPrecipitation,
} from "../../utils/acisService.js";
import { getSoilMapUnit, reverseGeocode, getCountiesByState } from "../../utils/externalServices.js";
import { getPriorMonths, haversineDistance } from "../../utils/geo.js";
import { calculateDetermination } from "../../utils/determination.js";
import { MAX_STATION_DISTANCE_MILES } from "../../config/constants.js";
import { parsePagination } from "../../utils/pagination.js";

// ─── HELPERS ───

const formatWetsStation = (name, distance) => {
  if (!name) return null;
  let text = `${name}\nThis is the closest station to site with all data`;
  if (typeof distance === 'number' && !Number.isNaN(distance)) {
    text += `\n${Math.round(distance * 10) / 10} miles from site`;
  }
  return text;
};

/**
 * Format the wetsStation text for triangulated (multi-station) mode.
 * Lists all station names and their distances.
 */
const formatTriangulatedWetsStation = (stations) => {
  if (!stations || stations.length === 0) return null;
  const names = stations.map((s) => s.name).join(", ");
  const distances = stations
    .map((s) => `${s.name}: ${Math.round(s.distance * 10) / 10} mi`)
    .join("\n");
  return `${names}\nTriangulated from ${stations.length} nearest stations\n${distances}`;
};

/**
 * Build the station info array used in both response and saving.
 */
const buildStationInfoArray = (stationObjects) =>
  stationObjects.map((s) => ({
    name: s.name,
    sid: s.sid,
    lat: s.lat,
    lon: s.lon,
    distance: Math.round(s.distance * 10) / 10,
  }));


// ═══════════════════════════════════════════════════════════════
// POST /api/v1/evaluations/calculate
// Main endpoint: takes location + date, returns full determination
// ═══════════════════════════════════════════════════════════════
export const calculate = async (req, res, next) => {
  try {
    const { lat, lon, observationDate, countyFips: inputFips } = req.body;

    const missing = [];
    if (!lat) missing.push("lat");
    if (!lon) missing.push("lon");
    if (!observationDate) missing.push("observationDate");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required`,
      });
    }

    // ─── STEP 1: Reverse geocode to get county ───
    const geo = await reverseGeocode(lat, lon);
    const countyFips = inputFips || geo.countyFips;

    if (!countyFips) {
      return res.status(400).json({
        success: false,
        message: "Could not determine county from coordinates",
      });
    }

    // ─── STEP 2: Find nearby stations ───
    const stations = await findStationsByBBox(lat, lon, MAX_STATION_DISTANCE_MILES);

    if (stations.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No AgACIS weather stations found within ${MAX_STATION_DISTANCE_MILES} miles`,
      });
    }

    // ─── STEP 3: Find first valid station with WETS data (ORIGINAL LOGIC) ───
    let selectedStation = null;
    let wetsData = null;
    const stationLog = [];

    for (const station of stations) {
      if (station.distance > MAX_STATION_DISTANCE_MILES) {
        break;
      }

      if (!station.hasPrecipData) {
        stationLog.push({
          stationName: station.name,
          sid: station.sid,
          distance: Math.round(station.distance * 10) / 10,
          status: "skipped",
          reason: "No precipitation data covering 1971-2000",
        });
        continue;
      }

      const wets = await getWetsData(station.sid);

      if (wets.isInsufficient) {
        stationLog.push({
          stationName: station.name,
          sid: station.sid,
          distance: Math.round(station.distance * 10) / 10,
          status: "insufficient",
          reason: "Insufficient WETS data for 1971-2000",
        });
        continue;
      }

      // Valid station found
      selectedStation = station;
      wetsData = wets;
      stationLog.push({
        stationName: station.name,
        sid: station.sid,
        distance: Math.round(station.distance * 10) / 10,
        status: "selected",
        reason: "Valid WETS data available",
      });
      break;
    }

    // ─── STEP 3b: TRIANGULATED FALLBACK ───
    // If no single station found, try to find 3 nearest valid ones and average
    let stationMethod = "single";
    let triangulatedStations = null; // array of { station, wetsData }
    let allStationInfos = [];

    if (!selectedStation) {
      const fallback = await findNearestValidStations(lat, lon, 3, MAX_STATION_DISTANCE_MILES);
      stationLog.push(...fallback.log);

      if (fallback.validStations.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No AgACIS WETS station with sufficient data found within ${MAX_STATION_DISTANCE_MILES} miles`,
          data: { stationLog, totalStationsChecked: stationLog.length },
        });
      }

      // Use the fallback stations
      triangulatedStations = fallback.validStations;
      selectedStation = triangulatedStations[0].station; // closest = primary
      wetsData = averageWetsData(triangulatedStations.map((s) => s.wetsData));
      stationMethod = triangulatedStations.length > 1 ? "triangulated" : "single";
      allStationInfos = buildStationInfoArray(triangulatedStations.map((s) => s.station));
    } else {
      allStationInfos = buildStationInfoArray([selectedStation]);
    }

    // ─── STEP 4: Determine 3 prior months ───
    const priorMonths = getPriorMonths(observationDate);

    // ─── STEP 5: Get actual monthly rainfall ───
    let rainfall;
    if (stationMethod === "triangulated") {
      // Average precipitation across all triangulated stations
      rainfall = await averageMultiStationPrecipitation(
        triangulatedStations.map((s) => s.station),
        priorMonths[2].num, priorMonths[2].year,
        priorMonths[0].num, priorMonths[0].year
      );
    } else {
      rainfall = await getMonthlyPrecipitation(
        selectedStation.sid,
        priorMonths[2].num, priorMonths[2].year,
        priorMonths[0].num, priorMonths[0].year
      );
    }

    // ─── STEP 6: Get soil map unit ───
    const soil = await getSoilMapUnit(lat, lon);

    // ─── STEP 7: Get growing season (always from closest station) ───
    const growingSeason = await getGrowingSeasonData(selectedStation.sid);

    // ─── STEP 8: Run NRCS Procedure 2 ───
    const result = calculateDetermination(priorMonths, wetsData, rainfall);

    // ─── BUILD RESPONSE ───
    const response = {
      // Summary (for Result card on map screen)
      simpleLabel: result.simpleLabel,
      determination: result.determination,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      period: result.period,

      // Station info (primary — backward compatible)
      station: {
        name: selectedStation.name,
        sid: selectedStation.sid,
        lat: selectedStation.lat,
        lon: selectedStation.lon,
        distance: Math.round(selectedStation.distance * 10) / 10,
      },

      // NEW: all stations used + method indicator
      stations: allStationInfos,
      stationMethod,

      // Location
      location: { lat, lon },
      county: geo.countyName,
      state: geo.stateCode,
      countyFips,

      // Rainfall Record table
      rainfallRecord: result.monthDetails.map((m) => ({
        month: m.month,
        less30: m.less30,
        avg: m.avg,
        more30: m.more30,
        rainfall: m.rainfall,
        condition: m.condition,
      })),

      // Full month details
      monthDetails: result.monthDetails,

      // Additional Information section
      additionalInfo: {
        wetsStation: stationMethod === "triangulated"
          ? formatTriangulatedWetsStation(allStationInfos)
          : formatWetsStation(selectedStation.name, selectedStation.distance),
        location: `${geo.countyName}, ${geo.stateCode}`,
        soilMapUnit: soil.muname
          ? `${soil.muname} (${soil.musym})`
          : "Not available",
        growingSeason: growingSeason.startDate
          ? `${growingSeason.startDate} - ${growingSeason.endDate} (${growingSeason.totalDays} days)`
          : "Not available",
        growingSeasonThreshold: `${growingSeason.probability} ≥ ${growingSeason.threshold}`,
      },

      climateReferencePeriod: "1971-2000",

      // Admin data
      stationLog,
      observationDate,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};


// ═══════════════════════════════════════════════════════════════
// POST /api/v1/evaluations/calculate-by-location
// Same result as /calculate but uses state + county name/FIPS
// ═══════════════════════════════════════════════════════════════
export const calculateByLocation = async (req, res, next) => {
  try {
    const { state, county, observationDate } = req.body;

    const missing = [];
    if (!state) missing.push("state");
    if (!county) missing.push("county");
    if (!observationDate) missing.push("observationDate");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required`,
      });
    }

    // ─── STEP 1: Resolve county FIPS ───
    let countyFips = null;
    let countyName = null;
    const stateCode = state.trim().toUpperCase();

    const isFips = /^\d{5}$/.test(county.trim());

    if (isFips) {
      countyFips = county.trim();
    } else {
      const counties = await getCountiesByState(stateCode);
      const searchName = county.trim().toLowerCase().replace(/\s+county$/i, "").trim();

      const match = counties.find((c) => {
        const cname = c.name.toLowerCase().replace(/\s+county$/i, "").trim();
        return cname === searchName || cname.startsWith(searchName);
      });

      if (!match) {
        return res.status(400).json({
          success: false,
          message: `County "${county}" not found in state "${stateCode}". Use GET /api/v1/stations/counties/${stateCode} to see valid counties.`,
        });
      }

      countyFips = match.fips;
      countyName = match.name;
    }

    // ─── STEP 2: Find stations in this county ───
    const countyStations = await findStationsByCounty(countyFips);

    // ─── STEP 3: Try to find a valid station in the county (ORIGINAL LOGIC) ───
    let selectedStation = null;
    let wetsData = null;
    const stationLog = [];

    for (const station of countyStations) {
      if (!station.hasPrecipData) {
        stationLog.push({
          stationName: station.name,
          sid: station.sid,
          status: "skipped",
          reason: "No precipitation data covering 1971-2000",
        });
        continue;
      }

      const wets = await getWetsData(station.sid);

      if (wets.isInsufficient) {
        stationLog.push({
          stationName: station.name,
          sid: station.sid,
          status: "insufficient",
          reason: "Insufficient WETS data for 1971-2000",
        });
        continue;
      }

      selectedStation = station;
      wetsData = wets;
      stationLog.push({
        stationName: station.name,
        sid: station.sid,
        status: "selected",
        reason: "Valid WETS data available",
      });
      break;
    }

    // ─── STEP 3b: TRIANGULATED FALLBACK ───
    // No valid station in county → find 3 nearest valid stations within 100 miles
    let stationMethod = "single";
    let triangulatedStations = null;
    let allStationInfos = [];
    let refLat, refLon;

    if (!selectedStation) {
      // We need a reference point for geographic search.
      // Use the centroid of whatever stations exist in the county,
      // or fall back to the county's first station's coords.
      if (countyStations.length > 0) {
        refLat = countyStations.reduce((s, st) => s + (st.lat || 0), 0) / countyStations.length;
        refLon = countyStations.reduce((s, st) => s + (st.lon || 0), 0) / countyStations.length;
      } else {
        // No stations at all in this county — cannot triangulate without coords
        return res.status(404).json({
          success: false,
          message: `No AgACIS weather stations found in county FIPS ${countyFips}. Try using the GPS-based /calculate endpoint instead.`,
          data: { stationLog, totalStationsChecked: stationLog.length },
        });
      }

      stationLog.push({
        stationName: "—",
        sid: "—",
        status: "fallback",
        reason: `No valid station in county — searching ${MAX_STATION_DISTANCE_MILES} mi radius for triangulation`,
      });

      const fallback = await findNearestValidStations(refLat, refLon, 3, MAX_STATION_DISTANCE_MILES);
      stationLog.push(...fallback.log);

      if (fallback.validStations.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No AgACIS WETS station with sufficient data found within ${MAX_STATION_DISTANCE_MILES} miles of county`,
          data: { stationLog, totalStationsChecked: stationLog.length },
        });
      }

      triangulatedStations = fallback.validStations;
      selectedStation = triangulatedStations[0].station; // closest = primary
      wetsData = averageWetsData(triangulatedStations.map((s) => s.wetsData));
      stationMethod = triangulatedStations.length > 1 ? "triangulated" : "single";
      allStationInfos = buildStationInfoArray(triangulatedStations.map((s) => s.station));
    } else {
      refLat = selectedStation.lat;
      refLon = selectedStation.lon;
      allStationInfos = buildStationInfoArray([selectedStation]);
    }

    // ─── STEP 4: Determine 3 prior months ───
    const priorMonths = getPriorMonths(observationDate);

    // ─── STEP 5: Get actual monthly rainfall ───
    let rainfall;
    if (stationMethod === "triangulated") {
      rainfall = await averageMultiStationPrecipitation(
        triangulatedStations.map((s) => s.station),
        priorMonths[2].num, priorMonths[2].year,
        priorMonths[0].num, priorMonths[0].year
      );
    } else {
      rainfall = await getMonthlyPrecipitation(
        selectedStation.sid,
        priorMonths[2].num, priorMonths[2].year,
        priorMonths[0].num, priorMonths[0].year
      );
    }

    // ─── STEP 6: Get soil map unit ───
    const soil = await getSoilMapUnit(refLat, refLon);

    // ─── STEP 7: Get growing season (from closest station) ───
    const growingSeason = await getGrowingSeasonData(selectedStation.sid);

    // ─── STEP 8: Run NRCS Procedure 2 ───
    const result = calculateDetermination(priorMonths, wetsData, rainfall);

    const displayCountyName = countyName || selectedStation.county || countyFips;

    // ─── BUILD RESPONSE ───
    const response = {
      simpleLabel: result.simpleLabel,
      determination: result.determination,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      period: result.period,

      // Primary station (backward compatible)
      station: {
        name: selectedStation.name,
        sid: selectedStation.sid,
        lat: selectedStation.lat,
        lon: selectedStation.lon,
        distance: selectedStation.distance != null
          ? Math.round(selectedStation.distance * 10) / 10
          : null,
      },

      // NEW: all stations + method
      stations: allStationInfos,
      stationMethod,

      location: { lat: refLat, lon: refLon },
      county: displayCountyName,
      state: stateCode,
      countyFips,

      rainfallRecord: result.monthDetails.map((m) => ({
        month: m.month,
        less30: m.less30,
        avg: m.avg,
        more30: m.more30,
        rainfall: m.rainfall,
        condition: m.condition,
      })),

      monthDetails: result.monthDetails,

      additionalInfo: {
        wetsStation: stationMethod === "triangulated"
          ? formatTriangulatedWetsStation(allStationInfos)
          : formatWetsStation(selectedStation.name, selectedStation.distance),
        location: `${displayCountyName}, ${stateCode}`,
        soilMapUnit: soil.muname
          ? `${soil.muname} (${soil.musym})`
          : "Not available",
        growingSeason: growingSeason.startDate
          ? `${growingSeason.startDate} - ${growingSeason.endDate} (${growingSeason.totalDays} days)`
          : "Not available",
        growingSeasonThreshold: `${growingSeason.probability} ≥ ${growingSeason.threshold}`,
      },

      climateReferencePeriod: "1971-2000",
      stationLog,
      observationDate,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};


// ═══════════════════════════════════════════════════════════════
// POST /api/v1/evaluations/save
// Save an evaluation result
// ═══════════════════════════════════════════════════════════════
export const saveEvaluation = async (req, res, next) => {
  try {
    const body = req.body;

    // If the client sends rainfallRecord but not monthDetails (older clients),
    // map rainfallRecord → monthDetails so the data is not silently dropped.
    const monthDetails =
      body.monthDetails?.length > 0
        ? body.monthDetails
        : (body.rainfallRecord || []).map((m, i) => ({
          position: i + 1,
          month: m.month,
          less30: m.less30,
          avg: m.avg,
          more30: m.more30,
          rainfall: m.rainfall,
          condition: m.condition,
        }));

    const evaluationData = {
      user: req.user._id,
      ...body,
      monthDetails,
    };

    const evaluation = await Evaluation.create(evaluationData);

    res.status(201).json({
      success: true,
      message: "Evaluation saved successfully",
      data: { id: evaluation._id },
    });
  } catch (error) {
    next(error);
  }
};


// ═══════════════════════════════════════════════════════════════
// GET /api/v1/evaluations/saved
// Get user's saved evaluations — flat list sorted by most recent
// ═══════════════════════════════════════════════════════════════
export const getSavedEvaluations = async (req, res, next) => {
  try {
    const evaluations = await Evaluation.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select("station.name stations stationMethod county state simpleLabel totalScore period createdAt location");

    const list = evaluations.map((e) => ({
      id: e._id,
      stationName: e.station?.name,
      stationMethod: e.stationMethod || "single",
      stationCount: e.stations?.length || 1,
      location: `${e.county}, ${e.state}`,
      simpleLabel: e.simpleLabel,
      totalScore: e.totalScore,
      period: e.period,
      savedAt: e.createdAt,
    }));

    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
};


// ═══════════════════════════════════════════════════════════════
// GET /api/v1/evaluations/:id
// Get single evaluation detail — same response shape as /calculate
// ═══════════════════════════════════════════════════════════════
export const getEvaluation = async (req, res, next) => {
  try {
    const e = await Evaluation.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!e) {
      return res.status(404).json({ success: false, message: "Evaluation not found" });
    }

    // Reconstruct allStationInfos from saved data
    const savedStations = e.stations?.length > 0
      ? e.stations.map((s) => ({ name: s.name, sid: s.sid, lat: s.lat, lon: s.lon, distance: s.distance }))
      : [{ name: e.station?.name, sid: e.station?.sid, lat: e.station?.lat, lon: e.station?.lon, distance: e.station?.distance }];

    const method = e.stationMethod || "single";

    const response = {
      // Summary
      simpleLabel: e.simpleLabel,
      determination: e.determination,
      totalScore: e.totalScore,
      maxScore: e.maxScore,
      period: e.period,

      // Primary station (backward compat)
      station: {
        name: e.station?.name,
        sid: e.station?.sid,
        lat: e.station?.lat,
        lon: e.station?.lon,
        distance: e.station?.distance ?? null,
      },

      // All stations + method
      stations: savedStations,
      stationMethod: method,

      // Location
      location: { lat: e.location?.lat, lon: e.location?.lon },
      county: e.county,
      state: e.state,
      countyFips: e.countyFips,

      // Rainfall record table
      rainfallRecord: (e.monthDetails || []).map((m) => ({
        month: m.month,
        less30: m.less30,
        avg: m.avg,
        more30: m.more30,
        rainfall: m.rainfall,
        condition: m.condition,
      })),

      // Additional info
      additionalInfo: {
        wetsStation: method === "triangulated"
          ? formatTriangulatedWetsStation(savedStations)
          : formatWetsStation(e.station?.name, e.station?.distance),
        location: `${e.county}, ${e.state}`,
        soilMapUnit: e.soilMapUnit?.name
          ? `${e.soilMapUnit.name} (${e.soilMapUnit.symbol})`
          : "Not available",
        growingSeason: e.growingSeason?.startDate
          ? `${e.growingSeason.startDate} - ${e.growingSeason.endDate} (${e.growingSeason.totalDays} days)`
          : "Not available",
        growingSeasonThreshold: e.growingSeason?.probability && e.growingSeason?.threshold
          ? `${e.growingSeason.probability} ≥ ${e.growingSeason.threshold}`
          : "Not available",
      },

      climateReferencePeriod: e.climateReferencePeriod || "1971-2000",
      stationLog: e.stationLog || [],
      observationDate: e.observationDate,
      savedAt: e.createdAt,
    };

    res.json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
};


// ═══════════════════════════════════════════════════════════════
// DELETE /api/v1/evaluations/:id
// ═══════════════════════════════════════════════════════════════
export const deleteEvaluation = async (req, res, next) => {
  try {
    const evaluation = await Evaluation.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!evaluation) {
      return res.status(404).json({ success: false, message: "Evaluation not found" });
    }

    res.json({ success: true, message: "Evaluation deleted" });
  } catch (error) {
    next(error);
  }
};


// ═══════════════════════════════════════════════════════════════
// GET /api/v1/evaluations/admin/all
// Admin: get all evaluations (for admin dashboard)
// ═══════════════════════════════════════════════════════════════
export const getAllEvaluations = async (req, res, next) => {
  try {
    const { status, state } = req.query;
    // page=0 / negative / non-numeric page previously produced a negative
    // or NaN skip, which MongoDB throws on — same bug class found and fixed
    // in subscription.controller.js during the production audit.
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });

    const filter = {};
    if (status) filter.simpleLabel = status;
    if (state) filter.state = state;

    const evaluations = await Evaluation.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Evaluation.countDocuments(filter);

    // Stats for dashboard KPIs
    const stats = await Evaluation.aggregate([
      { $group: { _id: "$simpleLabel", count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: {
        evaluations,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        stats: stats.reduce((acc, s) => ({ ...acc, [s._id || "unknown"]: s.count }), {}),
      },
    });
  } catch (error) {
    next(error);
  }
};
