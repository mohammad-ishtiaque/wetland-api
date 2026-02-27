import { findStationsByBBox, findStationsByCounty, getWetsData } from "../../utils/acisService.js";
import { reverseGeocode, getCountiesByState, US_STATES } from "../../utils/externalServices.js";
import { MAX_STATION_DISTANCE_MILES } from "../../config/constants.js";

// ─── GET /api/v1/stations/states ───
// For the "Select State" dropdown on home screen
export const getStates = async (req, res) => {
  res.json({ success: true, data: US_STATES });
};

// ─── GET /api/v1/stations/counties/:stateCode ───
// For the "Select County" dropdown on home screen
export const getCounties = async (req, res, next) => {
  try {
    const counties = await getCountiesByState(req.params.stateCode);
    res.json({ success: true, data: counties });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/stations/nearest ───
// Find nearest stations from GPS coordinates
// Used when auto-search fails and user needs to pick manually
export const getNearestStations = async (req, res, next) => {
  try {
    const { lat, lon, radiusMiles = 10 } = req.body;

    if (!lat || !lon) {
      return res.status(400).json({ success: false, message: "lat and lon are required" });
    }

    const stations = await findStationsByBBox(lat, lon, radiusMiles);

    // Check WETS availability for each (limit to avoid slow responses)
    const stationsWithStatus = [];
    for (const station of stations.slice(0, 20)) {
      const wets = await getWetsData(station.sid);
      stationsWithStatus.push({
        name: station.name,
        sid: station.sid,
        lat: station.lat,
        lon: station.lon,
        state: station.state,
        distance: Math.round(station.distance * 10) / 10,
        hasWetsData: !wets.isInsufficient,
        validRange: station.validRange,
      });
    }

    const hasValidStation = stationsWithStatus.some((s) => s.hasWetsData);

    res.json({
      success: true,
      data: {
        stations: stationsWithStatus,
        searchRadius: radiusMiles,
        hasValidStation,
        message: hasValidStation
          ? null
          : `No AgACIS WETS station with sufficient data found within ${radiusMiles} miles`,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/stations/search-more ───
// Expand search radius (10 → 20 → 30 → ... up to 100)
// Triggered by "View More Nearby Stations" button
export const searchMoreStations = async (req, res, next) => {
  try {
    const { lat, lon, currentRadius = 10 } = req.body;
    const newRadius = Math.min(currentRadius + 10, MAX_STATION_DISTANCE_MILES);

    const stations = await findStationsByBBox(lat, lon, newRadius);

    const stationsWithStatus = [];
    for (const station of stations.slice(0, 30)) {
      const wets = await getWetsData(station.sid);
      stationsWithStatus.push({
        name: station.name,
        sid: station.sid,
        lat: station.lat,
        lon: station.lon,
        state: station.state,
        distance: Math.round(station.distance * 10) / 10,
        hasWetsData: !wets.isInsufficient,
      });
    }

    const hasValidStation = stationsWithStatus.some((s) => s.hasWetsData);
    const reachedLimit = newRadius >= MAX_STATION_DISTANCE_MILES;

    res.json({
      success: true,
      data: {
        stations: stationsWithStatus,
        searchRadius: newRadius,
        hasValidStation,
        reachedLimit,
        message: reachedLimit && !hasValidStation
          ? `No sufficient data within ${MAX_STATION_DISTANCE_MILES} miles`
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/stations/by-county ───
// Find stations by county FIPS (for home screen search)
export const getStationsByCounty = async (req, res, next) => {
  try {
    const { countyFips } = req.body;

    if (!countyFips) {
      return res.status(400).json({ success: false, message: "countyFips is required" });
    }

    const stations = await findStationsByCounty(countyFips);

    res.json({
      success: true,
      data: {
        stations: stations.map((s) => ({
          name: s.name,
          sid: s.sid,
          lat: s.lat,
          lon: s.lon,
          state: s.state,
          hasPrecipData: s.hasPrecipData,
          validRange: s.validRange,
        })),
        total: stations.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/v1/stations/reverse-geocode ───
// Get county/state from GPS (for Quick Search screen)
export const reverseGeocodeEndpoint = async (req, res, next) => {
  try {
    const { lat, lon } = req.body;
    const result = await reverseGeocode(lat, lon);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
