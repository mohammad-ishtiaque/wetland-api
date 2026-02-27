// ─── NRCS PROCEDURE 2 CONSTANTS (NEVER CHANGE) ───

export const WETS_YEAR_START = 1971;
export const WETS_YEAR_END = 2000;

export const GROWING_SEASON_PROBABILITY = 50; // percent
export const GROWING_SEASON_THRESHOLD_F = 28; // Fahrenheit

export const MAX_STATION_DISTANCE_MILES = 100;

// Condition classification
export const CONDITION = {
  DRY: "Dry",
  NORMAL: "Normal",
  WET: "Wet",
};

// Condition values for scoring
export const CONDITION_VALUE = {
  [CONDITION.DRY]: 1,
  [CONDITION.NORMAL]: 2,
  [CONDITION.WET]: 3,
};

// Weights: 1st prior = 3, 2nd prior = 2, 3rd prior = 1
export const MONTH_WEIGHTS = [3, 2, 1];

// Final determination score bands
export const DETERMINATION = {
  DRY: { min: 6, max: 9, label: "Drier than Normal" },
  NORMAL: { min: 10, max: 14, label: "Normal" },
  WET: { min: 15, max: 18, label: "Wetter than Normal" },
};

// Month names
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// API base URLs
export const ACIS_BASE_URL = "https://data.rcc-acis.org";
export const SDA_BASE_URL = "https://SDMDataAccess.sc.egov.usda.gov";
export const FCC_GEO_URL = "https://geo.fcc.gov/api/census/area";
