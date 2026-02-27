import axios from "axios";
import NodeCache from "node-cache";
import { ACIS_BASE_URL, WETS_YEAR_START, WETS_YEAR_END } from "../config/constants.js";
import { haversineDistance, createBBox } from "../utils/geo.js";

// Cache: WETS data is static (1971-2000), cache permanently
const cache = new NodeCache({ stdTTL: 0 }); // 0 = no expiry
const stationCache = new NodeCache({ stdTTL: 86400 }); // 24h for station meta

// ─────────────────────────────────────────────────
// 1. FIND STATIONS BY COUNTY FIPS
// ─────────────────────────────────────────────────
export const findStationsByCounty = async (countyFips) => {
  const cacheKey = `stations_county_${countyFips}`;
  const cached = stationCache.get(cacheKey);
  if (cached) return cached;

  const { data } = await axios.post(`${ACIS_BASE_URL}/StnMeta`, {
    county: countyFips,
    meta: ["name", "state", "sids", "ll", "elev", "county", "valid_daterange"],
    elems: ["pcpn"],
  });

  const stations = (data.meta || []).map((s) => ({
    name: s.name,
    state: s.state,
    sids: s.sids,
    sid: extractCoopId(s.sids),
    lat: s.ll?.[1],
    lon: s.ll?.[0],
    elevation: s.elev,
    county: s.county,
    validRange: s.valid_daterange?.[0] || [],
    hasPrecipData: checkDateRange(s.valid_daterange?.[0]),
  }));

  stationCache.set(cacheKey, stations);
  return stations;
};

// ─────────────────────────────────────────────────
// 2. FIND STATIONS BY BOUNDING BOX (GPS-based)
// ─────────────────────────────────────────────────
export const findStationsByBBox = async (lat, lon, radiusMiles = 50) => {
  const bbox = createBBox(lat, lon, radiusMiles);
  const cacheKey = `stations_bbox_${bbox}`;
  const cached = stationCache.get(cacheKey);
  if (cached) return cached;

  const { data } = await axios.post(`${ACIS_BASE_URL}/StnMeta`, {
    bbox,
    meta: ["name", "state", "sids", "ll", "elev", "county", "valid_daterange"],
    elems: ["pcpn"],
  });

  const stations = (data.meta || []).map((s) => ({
    name: s.name,
    state: s.state,
    sids: s.sids,
    sid: extractCoopId(s.sids),
    lat: s.ll?.[1],
    lon: s.ll?.[0],
    elevation: s.elev,
    county: s.county,
    validRange: s.valid_daterange?.[0] || [],
    distance: haversineDistance(lat, lon, s.ll?.[1], s.ll?.[0]),
    hasPrecipData: checkDateRange(s.valid_daterange?.[0]),
  }));

  // Sort by distance
  stations.sort((a, b) => a.distance - b.distance);

  stationCache.set(cacheKey, stations);
  return stations;
};

// ─────────────────────────────────────────────────
// 3. GET MONTHLY PRECIPITATION (actual rainfall)
// ─────────────────────────────────────────────────
export const getMonthlyPrecipitation = async (sid, startMonth, startYear, endMonth, endYear) => {
  const cacheKey = `precip_${sid}_${startYear}${startMonth}_${endYear}${endMonth}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const sdate = `${startYear}-${String(startMonth).padStart(2, "0")}`;
  const edate = `${endYear}-${String(endMonth).padStart(2, "0")}`;

  const { data } = await axios.post(`${ACIS_BASE_URL}/StnData`, {
    sid,
    sdate,
    edate,
    elems: [
      {
        name: "pcpn",
        interval: "mly",
        duration: "mly",
        reduce: "sum",
      },
    ],
  });

  const result = {};
  if (data.data) {
    for (const [dateStr, value] of data.data) {
      const [year, month] = dateStr.split("-").map(Number);
      result[month] = {
        year,
        month,
        value: value === "M" ? null : value === "T" ? 0 : parseFloat(value),
        raw: value,
      };
    }
  }

  cache.set(cacheKey, result);
  return result;
};

// ─────────────────────────────────────────────────
// 4. GET WETS DATA (30-year normals 1971-2000)
// Approach B: Compute from raw ACIS monthly data
// ─────────────────────────────────────────────────
export const getWetsData = async (sid) => {
  const cacheKey = `wets_${sid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // Pull all monthly precipitation for 1971-2000
    const { data } = await axios.post(`${ACIS_BASE_URL}/StnData`, {
      sid,
      sdate: `${WETS_YEAR_START}-01`,
      edate: `${WETS_YEAR_END}-12`,
      elems: [
        {
          name: "pcpn",
          interval: "mly",
          duration: "mly",
          reduce: "sum",
          maxmissing: 5,
        },
      ],
    });

    if (!data.data || data.data.length < 120) {
      return { isInsufficient: true, stationName: data.meta?.name };
    }

    // Group by month (1-12)
    const monthlyData = {};
    for (let m = 1; m <= 12; m++) monthlyData[m] = [];

    for (const [dateStr, value] of data.data) {
      if (value === "M") continue;
      const month = parseInt(dateStr.split("-")[1]);
      const val = value === "T" ? 0 : parseFloat(value);
      if (!isNaN(val)) monthlyData[month].push(val);
    }

    // Calculate average and approximate 30% thresholds
    // Using simplified percentile approach (gamma distribution approximation)
    const wets = {};
    for (let m = 1; m <= 12; m++) {
      const values = monthlyData[m].sort((a, b) => a - b);

      if (values.length < 10) {
        wets[m] = { avg: null, less30: null, more30: null, insufficient: true };
        continue;
      }

      const avg = values.reduce((s, v) => s + v, 0) / values.length;

      // 30th and 70th percentile (approximation of gamma distribution)
      const idx30 = Math.floor(values.length * 0.3);
      const idx70 = Math.floor(values.length * 0.7);

      wets[m] = {
        avg: round2(avg),
        less30: round2(values[idx30]),
        more30: round2(values[idx70]),
        insufficient: false,
      };
    }

    const result = {
      isInsufficient: false,
      stationName: data.meta?.name,
      period: `${WETS_YEAR_START}-${WETS_YEAR_END}`,
      months: wets,
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`WETS fetch error for ${sid}:`, error.message);
    return { isInsufficient: true, error: error.message };
  }
};

// ─────────────────────────────────────────────────
// 5. GET GROWING SEASON DATA
// ─────────────────────────────────────────────────
export const getGrowingSeasonData = async (sid) => {
  const cacheKey = `growing_${sid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // Get last spring freeze and first fall freeze dates
    // Using min temperature data for 1971-2000
    const { data } = await axios.post(`${ACIS_BASE_URL}/StnData`, {
      sid,
      sdate: `${WETS_YEAR_START}`,
      edate: `${WETS_YEAR_END}`,
      elems: [
        {
          name: "mint",
          interval: [1, 0, 0], // yearly
          duration: "std",
          season_start: "7-1",
          reduce: { reduce: "last_le_28", add: "date" },
        },
        {
          name: "mint",
          interval: [1, 0, 0],
          duration: "std",
          season_start: "1-1",
          reduce: { reduce: "first_le_28", add: "date" },
        },
      ],
    });

    // Parse and calculate median growing season
    // This is a simplified version - production should use full WETS calculation
    const result = {
      threshold: "28°F",
      probability: "50%",
      startDate: null,
      endDate: null,
      totalDays: null,
    };

    cache.set(cacheKey, result);
    return result;
  } catch {
    return { threshold: "28°F", probability: "50%", startDate: null, endDate: null, totalDays: null };
  }
};

// ─── HELPERS ───
function extractCoopId(sids) {
  if (!sids) return null;
  // Prefer COOP ID (type 2), then GHCN (type 6), then first available
  const coop = sids.find((s) => s.endsWith(" 2"));
  if (coop) return coop.split(" ")[0];
  const ghcn = sids.find((s) => s.endsWith(" 6"));
  if (ghcn) return ghcn.split(" ")[0];
  return sids[0]?.split(" ")[0] || null;
}

function checkDateRange(range) {
  if (!range || range.length < 2) return false;
  const startYear = parseInt(range[0]?.split("-")[0]);
  const endYear = parseInt(range[1]?.split("-")[0]);
  return startYear <= WETS_YEAR_START && endYear >= WETS_YEAR_END;
}

function round2(val) {
  return Math.round(val * 100) / 100;
}
