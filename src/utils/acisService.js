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
// 50th-percentile (median) last spring freeze and first fall freeze
// Threshold: 28°F — matches NRCS/WETS standard
// ─────────────────────────────────────────────────
export const getGrowingSeasonData = async (sid) => {
  const cacheKey = `growing_${sid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const EMPTY = { threshold: "28°F", probability: "50%", startDate: null, endDate: null, totalDays: null };

  try {
    /*
     * We request two yearly-interval elements from ACIS, both using add:"date"
     * so each row contains the actual date on which the threshold was crossed.
     *
     * Element 1 — last spring freeze (last date min-temp ≤ 28°F before summer):
     *   season_start: "1-1"  → calendar year (Jan–Dec)
     *   reduce: "last_le_28" → last occurrence in that season = last spring freeze
     *
     * Element 2 — first fall freeze (first date min-temp ≤ 28°F after summer):
     *   season_start: "7-1"  → Jul–Jun season
     *   reduce: "first_le_28"→ first occurrence after July = first autumn freeze
     */
    const { data } = await axios.post(`${ACIS_BASE_URL}/StnData`, {
      sid,
      sdate: `${WETS_YEAR_START}-01-01`,
      edate: `${WETS_YEAR_END}-12-31`,
      elems: [
        {
          name: "mint",
          interval: [1, 0, 0],
          duration: "std",
          season_start: "1-1",
          reduce: { reduce: "last_le_28", add: "date" },
        },
        {
          name: "mint",
          interval: [1, 0, 0],
          duration: "std",
          season_start: "7-1",
          reduce: { reduce: "first_le_28", add: "date" },
        },
      ],
    });

    if (!data.data || data.data.length < 10) {
      cache.set(cacheKey, EMPTY);
      return EMPTY;
    }

    const springDOYs = []; // day-of-year for last spring freeze, each year
    const fallDOYs = []; // day-of-year for first fall  freeze, each year

    for (const row of data.data) {
      // row: [ "YYYY-MM-DD", springElem, fallElem ]
      // Each elem with add:"date" is: [ numericValue, "YYYY-MM-DD" ] or "M" if missing
      const springElem = row[1];
      const fallElem = row[2];

      // Extract date strings robustly (handle both array and plain-string forms)
      const springDateStr = Array.isArray(springElem) ? springElem[1] : null;
      const fallDateStr = Array.isArray(fallElem) ? fallElem[1] : null;

      if (springDateStr && springDateStr !== "M" && springDateStr.length >= 8) {
        const doy = dateToDOY(springDateStr);
        if (doy !== null && doy >= 1 && doy <= 200) {
          // Sanity-check: spring freeze must be before July (DOY ≤ 200 ≈ July 18)
          springDOYs.push(doy);
        }
      }

      if (fallDateStr && fallDateStr !== "M" && fallDateStr.length >= 8) {
        const doy = dateToDOY(fallDateStr);
        if (doy !== null && doy >= 182) {
          // Sanity-check: fall freeze must be on/after July 1 (DOY ≥ 182)
          fallDOYs.push(doy);
        }
      }
    }

    // Need at least half the years to compute a reliable median
    if (springDOYs.length < 5 || fallDOYs.length < 5) {
      cache.set(cacheKey, EMPTY);
      return EMPTY;
    }

    springDOYs.sort((a, b) => a - b);
    fallDOYs.sort((a, b) => a - b);

    // 50th percentile = median
    const springMedianDOY = springDOYs[Math.floor(springDOYs.length / 2)];
    const fallMedianDOY = fallDOYs[Math.floor(fallDOYs.length / 2)];

    const totalDays = fallMedianDOY - springMedianDOY;

    const result = totalDays > 0
      ? {
        threshold: "28°F",
        probability: "50%",
        startDate: doyToDisplay(springMedianDOY),
        endDate: doyToDisplay(fallMedianDOY),
        totalDays,
      }
      : EMPTY;

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Growing season error for ${sid}:`, error.message);
    return EMPTY;
  }
};

// ─────────────────────────────────────────────────
// 6. FIND N NEAREST VALID STATIONS (for triangulated fallback)
//    Returns up to `count` stations that have valid WETS data,
//    sorted by distance from (lat, lon).
// ─────────────────────────────────────────────────
export const findNearestValidStations = async (lat, lon, count = 3, maxMiles = 100) => {
  const stations = await findStationsByBBox(lat, lon, maxMiles);

  const validStations = [];
  const log = [];

  for (const station of stations) {
    if (station.distance > maxMiles) break;
    if (validStations.length >= count) break;

    if (!station.hasPrecipData) {
      log.push({
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
      log.push({
        stationName: station.name,
        sid: station.sid,
        distance: Math.round(station.distance * 10) / 10,
        status: "insufficient",
        reason: "Insufficient WETS data for 1971-2000",
      });
      continue;
    }

    validStations.push({ station, wetsData: wets });
    log.push({
      stationName: station.name,
      sid: station.sid,
      distance: Math.round(station.distance * 10) / 10,
      status: "selected",
      reason: `Valid WETS data — triangulated station ${validStations.length} of ${count}`,
    });
  }

  return { validStations, log };
};

// ─────────────────────────────────────────────────
// 7. AVERAGE WETS DATA from multiple stations
//    Produces a single wetsData object with averaged thresholds
// ─────────────────────────────────────────────────
export const averageWetsData = (wetsDataArray) => {
  const averaged = { isInsufficient: false, months: {} };

  for (let m = 1; m <= 12; m++) {
    const values = wetsDataArray
      .map((w) => w.months?.[m])
      .filter((v) => v && !v.insufficient);

    if (values.length === 0) {
      averaged.months[m] = { avg: null, less30: null, more30: null, insufficient: true };
      continue;
    }

    averaged.months[m] = {
      avg: round2(values.reduce((s, v) => s + v.avg, 0) / values.length),
      less30: round2(values.reduce((s, v) => s + v.less30, 0) / values.length),
      more30: round2(values.reduce((s, v) => s + v.more30, 0) / values.length),
      insufficient: false,
    };
  }

  return averaged;
};

// ─────────────────────────────────────────────────
// 8. AVERAGE PRECIPITATION from multiple stations
//    Calls getMonthlyPrecipitation for each, averages per month
// ─────────────────────────────────────────────────
export const averageMultiStationPrecipitation = async (
  stations,
  startMonth, startYear,
  endMonth, endYear
) => {
  // Fetch precipitation for every station in parallel
  const allPrecip = await Promise.all(
    stations.map((s) =>
      getMonthlyPrecipitation(s.sid, startMonth, startYear, endMonth, endYear)
    )
  );

  // Merge: for each month, average non-null values
  const merged = {};
  const allMonthKeys = new Set(allPrecip.flatMap((p) => Object.keys(p).map(Number)));

  for (const month of allMonthKeys) {
    const readings = allPrecip
      .map((p) => p[month])
      .filter((r) => r && r.value !== null && r.value !== undefined);

    if (readings.length === 0) {
      merged[month] = { year: allPrecip[0]?.[month]?.year, month, value: null, raw: "M" };
      continue;
    }

    const avgValue = round2(readings.reduce((s, r) => s + r.value, 0) / readings.length);
    merged[month] = {
      year: readings[0].year,
      month,
      value: avgValue,
      raw: `avg(${readings.map((r) => r.raw).join(",")})`,
    };
  }

  return merged;
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

/**
 * Convert "YYYY-MM-DD" to day-of-year (1 = Jan 1, 365 = Dec 31)
 * Uses UTC to avoid timezone issues.
 */
function dateToDOY(dateStr) {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.floor((d - yearStart) / 86_400_000) + 1;
  } catch {
    return null;
  }
}

/**
 * Convert day-of-year back to a human-readable string like "March 4".
 * Uses a non-leap reference year (2001) so DOY 365 = Dec 31.
 */
function doyToDisplay(doy) {
  const ref = new Date(Date.UTC(2001, 0, doy));
  return ref.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
