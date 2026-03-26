import Evaluation from "./evaluation.model.js";
import {
  findStationsByBBox,
  findStationsByCounty,
  getMonthlyPrecipitation,
  getWetsData,
  getGrowingSeasonData,
} from "../../utils/acisService.js";
import { getSoilMapUnit, reverseGeocode, getCountiesByState } from "../../utils/externalServices.js";
import { getPriorMonths, haversineDistance } from "../../utils/geo.js";
import { calculateDetermination } from "../../utils/determination.js";
import { MAX_STATION_DISTANCE_MILES } from "../../config/constants.js";

const formatWetsStation = (name, distance) => {
  if (!name) return null;
  let text = `${name}\nThis is the closest station to site with all data`;
  if (typeof distance === 'number' && !Number.isNaN(distance)) {
    text += `\n${Math.round(distance * 10) / 10} miles from site`;
  }
  return text;
};

// ─── POST /api/v1/evaluations/calculate ───
// Main endpoint: takes location + date, returns full determination
export const calculate = async (req, res, next) => {
  try {
    const { lat, lon, observationDate, countyFips: inputFips } = req.body;

    if (!lat || !lon || !observationDate) {
      return res.status(400).json({
        success: false,
        message: "lat, lon, and observationDate are required",
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

    // ─── STEP 3: Find first valid station with WETS data ───
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

    if (!selectedStation) {
      return res.status(404).json({
        success: false,
        message: `No AgACIS WETS station with sufficient data found within ${MAX_STATION_DISTANCE_MILES} miles`,
        data: { stationLog, totalStationsChecked: stationLog.length },
      });
    }

    // ─── STEP 4: Determine 3 prior months ───
    const priorMonths = getPriorMonths(observationDate);

    // ─── STEP 5: Get actual monthly rainfall ───
    const rainfall = await getMonthlyPrecipitation(
      selectedStation.sid,
      priorMonths[2].num, priorMonths[2].year, // earliest month
      priorMonths[0].num, priorMonths[0].year   // latest month
    );

    // ─── STEP 6: Get soil map unit ───
    const soil = await getSoilMapUnit(lat, lon);

    // ─── STEP 7: Get growing season ───
    const growingSeason = await getGrowingSeasonData(selectedStation.sid);

    // ─── STEP 8: Run NRCS Procedure 2 ───
    const result = calculateDetermination(priorMonths, wetsData, rainfall);

    // ─── BUILD RESPONSE ───
    const response = {
      // Summary (for Result card on map screen)
      simpleLabel: result.simpleLabel,          // "WET" | "DRY" | "NORMAL"
      determination: result.determination,       // "Wetter than Normal"
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      period: result.period,

      // Station info
      station: {
        name: selectedStation.name,
        sid: selectedStation.sid,
        lat: selectedStation.lat,
        lon: selectedStation.lon,
        distance: Math.round(selectedStation.distance * 10) / 10,
      },

      // Location
      location: { lat, lon },
      county: geo.countyName,
      state: geo.stateCode,
      countyFips,

      // Rainfall Record table (for Result Summary screen)
      rainfallRecord: result.monthDetails.map((m) => ({
        month: m.month,
        less30: m.less30,
        avg: m.avg,
        more30: m.more30,
        rainfall: m.rainfall,
        condition: m.condition,
      })),

      // Full month details — send this back when saving so it can be stored
      monthDetails: result.monthDetails,

      // Additional Information section
      additionalInfo: {
        wetsStation: formatWetsStation(selectedStation.name, selectedStation.distance),
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

// ─── POST /api/v1/evaluations/calculate-by-location ───
// Same result as /calculate but uses state + county name/FIPS instead of lat/lon
export const calculateByLocation = async (req, res, next) => {
  try {
    const { state, county, observationDate } = req.body;

    if (!state || !county || !observationDate) {
      return res.status(400).json({
        success: false,
        message: "state, county, and observationDate are required",
      });
    }

    // ─── STEP 1: Resolve county FIPS ───
    // Accept either a 5-digit FIPS string directly, or a county name to look up
    let countyFips = null;
    let countyName = null;
    const stateCode = state.trim().toUpperCase();

    const isFips = /^\d{5}$/.test(county.trim());

    if (isFips) {
      countyFips = county.trim();
      // We'll populate countyName later from the ACIS station metadata
    } else {
      // Look up counties in the state and match by name (case-insensitive)
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
    const stations = await findStationsByCounty(countyFips);

    if (stations.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No AgACIS weather stations found in county FIPS ${countyFips}`,
      });
    }

    // ─── STEP 3: Find first valid station with WETS data ───
    let selectedStation = null;
    let wetsData = null;
    const stationLog = [];

    for (const station of stations) {
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

    if (!selectedStation) {
      return res.status(404).json({
        success: false,
        message: `No AgACIS WETS station with sufficient data found in county FIPS ${countyFips}`,
        data: { stationLog, totalStationsChecked: stationLog.length },
      });
    }

    // Use station coordinates as the representative point for this county
    const refLat = selectedStation.lat;
    const refLon = selectedStation.lon;

    // ─── STEP 4: Determine 3 prior months ───
    const priorMonths = getPriorMonths(observationDate);

    // ─── STEP 5: Get actual monthly rainfall ───
    const rainfall = await getMonthlyPrecipitation(
      selectedStation.sid,
      priorMonths[2].num, priorMonths[2].year,
      priorMonths[0].num, priorMonths[0].year
    );

    // ─── STEP 6: Get soil map unit (using station coords as proxy) ───
    const soil = await getSoilMapUnit(refLat, refLon);

    // ─── STEP 7: Get growing season ───
    const growingSeason = await getGrowingSeasonData(selectedStation.sid);

    // ─── STEP 8: Run NRCS Procedure 2 ───
    const result = calculateDetermination(priorMonths, wetsData, rainfall);

    const displayCountyName = countyName || selectedStation.county || countyFips;

    // ─── BUILD RESPONSE (identical shape to /calculate) ───
    const response = {
      simpleLabel: result.simpleLabel,
      determination: result.determination,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      period: result.period,

      station: {
        name: selectedStation.name,
        sid: selectedStation.sid,
        lat: refLat,
        lon: refLon,
        distance: null, // no user GPS to measure from
      },

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

      // Full month details — send this back when saving so it can be stored
      monthDetails: result.monthDetails,

      additionalInfo: {
        wetsStation: formatWetsStation(selectedStation.name, selectedStation.distance),
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

// ─── POST /api/v1/evaluations/save ───
// Save an evaluation result
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

// ─── GET /api/v1/evaluations/saved ───
// Get user's saved evaluations — flat list sorted by most recent
export const getSavedEvaluations = async (req, res, next) => {
  try {
    const evaluations = await Evaluation.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select("station.name county state simpleLabel totalScore period createdAt location");

    const list = evaluations.map((e) => ({
      id: e._id,
      stationName: e.station?.name,
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

// ─── GET /api/v1/evaluations/:id ───
// Get single evaluation detail — same response shape as /calculate
export const getEvaluation = async (req, res, next) => {
  try {
    const e = await Evaluation.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!e) {
      return res.status(404).json({ success: false, message: "Evaluation not found" });
    }

    const response = {
      // Summary
      simpleLabel: e.simpleLabel,
      determination: e.determination,
      totalScore: e.totalScore,
      maxScore: e.maxScore,
      period: e.period,

      // Station
      station: {
        name: e.station?.name,
        sid: e.station?.sid,
        lat: e.station?.lat,
        lon: e.station?.lon,
        distance: e.station?.distance ?? null,
      },

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
        wetsStation: formatWetsStation(e.station?.name, e.station?.distance),
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

// ─── DELETE /api/v1/evaluations/:id ───
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

// ─── GET /api/v1/evaluations/admin/all ───
// Admin: get all evaluations (for admin dashboard)
export const getAllEvaluations = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, state } = req.query;

    const filter = {};
    if (status) filter.simpleLabel = status;
    if (state) filter.state = state;

    const evaluations = await Evaluation.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Evaluation.countDocuments(filter);

    // Stats for dashboard KPIs
    const stats = await Evaluation.aggregate([
      { $group: { _id: "$simpleLabel", count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: {
        evaluations,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
        stats: stats.reduce((acc, s) => ({ ...acc, [s._id || "unknown"]: s.count }), {}),
      },
    });
  } catch (error) {
    next(error);
  }
};
