import axios from "axios";
import NodeCache from "node-cache";
import { SDA_BASE_URL, FCC_GEO_URL } from "../config/constants.js";

const cache = new NodeCache({ stdTTL: 0 }); // Soil data = permanent cache

// ─────────────────────────────────────────────────
// NRCS SOIL DATA ACCESS - Get soil map unit by GPS
// ─────────────────────────────────────────────────
export const getSoilMapUnit = async (lat, lon) => {
  const cacheKey = `soil_${lat.toFixed(5)}_${lon.toFixed(5)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const query = `
      SELECT mapunit.muname, mapunit.musym, mapunit.mukey
      FROM mapunit
      INNER JOIN SDA_Get_Mukey_from_intersection_with_WktWgs84(
        'POINT(${lon} ${lat})'
      ) AS t ON mapunit.mukey = t.mukey
    `.trim();

    const { data } = await axios.post(
      `${SDA_BASE_URL}/Tabular/post.rest`,
      { format: "JSON", query },
      { headers: { "Content-Type": "application/json" } }
    );

    const table = data?.Table;
    if (!table || table.length === 0) {
      return { muname: null, musym: null, mukey: null };
    }

    const result = {
      muname: table[0].muname,
      musym: table[0].musym,
      mukey: table[0].mukey,
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Soil API error:", error.message);
    return { muname: null, musym: null, mukey: null, error: error.message };
  }
};

// ─────────────────────────────────────────────────
// FCC REVERSE GEOCODING - Get county/state from GPS
// ─────────────────────────────────────────────────
export const reverseGeocode = async (lat, lon) => {
  const cacheKey = `geo_${lat.toFixed(4)}_${lon.toFixed(4)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(FCC_GEO_URL, {
      params: { lat, lon, format: "json" },
    });

    const result = data?.results?.[0];
    if (!result) {
      return { countyFips: null, countyName: null, stateFips: null, stateCode: null };
    }

    const geo = {
      countyFips: result.county_fips,
      countyName: result.county_name,
      stateFips: result.state_fips,
      stateCode: result.state_code,
      stateName: result.state_name,
    };

    cache.set(cacheKey, geo);
    return geo;
  } catch (error) {
    console.error("Geocode error:", error.message);
    return { countyFips: null, error: error.message };
  }
};

// ─────────────────────────────────────────────────
// GET FIPS CODE LIST (for state/county dropdowns)
// ─────────────────────────────────────────────────
export const getCountiesByState = async (stateCode) => {
  try {
    const { data } = await axios.get(
      `https://data.rcc-acis.org/General/county?state=${stateCode}`
    );
    return (data.meta || []).map((c) => ({
      fips: c.id,
      name: c.name,
      state: stateCode,
    }));
  } catch (error) {
    console.error("County list error:", error.message);
    return [];
  }
};

// US States list for the dropdown
export const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];
