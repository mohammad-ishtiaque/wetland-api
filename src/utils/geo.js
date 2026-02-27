/**
 * Haversine formula: calculate distance in miles between two lat/lon points
 */
export const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 3959; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Create bounding box around a point (for ACIS station search)
 * @param {number} lat - center latitude
 * @param {number} lon - center longitude
 * @param {number} radiusMiles - search radius
 * @returns {string} "west,south,east,north"
 */
export const createBBox = (lat, lon, radiusMiles = 50) => {
  const latOffset = radiusMiles / 69;
  const lonOffset = radiusMiles / (69 * Math.cos(toRad(lat)));

  const west = (lon - lonOffset).toFixed(4);
  const south = (lat - latOffset).toFixed(4);
  const east = (lon + lonOffset).toFixed(4);
  const north = (lat + latOffset).toFixed(4);

  return `${west},${south},${east},${north}`;
};

/**
 * Get the 3 prior months from an observation date
 * @param {Date|string} observationDate
 * @returns {Array<{name: string, num: number, year: number}>}
 */
export const getPriorMonths = (observationDate) => {
  const date = new Date(observationDate);
  const months = [];

  for (let i = 1; i <= 3; i++) {
    const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
    months.push({
      name: d.toLocaleString("en-US", { month: "long" }),
      num: d.getMonth() + 1,
      year: d.getFullYear(),
    });
  }

  return months;
};

/**
 * Convert UTM coordinates to Lat/Long (WGS84)
 * Pure math — no external dependency needed
 */
export const utmToLatLon = (easting, northing, zoneNum, zoneLetter) => {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const k0 = 0.9996;

  const x = easting - 500000;
  const y = zoneLetter < "N" ? northing - 10000000 : northing;

  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const ep2 = e2 / (1 - e2);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      (D * D / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) *
          D * D * D * D * D * D) /
          720);

  const lon =
    (D -
      ((1 + 2 * T1 + C1) * D * D * D) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) *
        D * D * D * D * D) /
        120) /
    cosPhi1;

  const latitude = (lat * 180) / Math.PI;
  const longitude = ((zoneNum - 1) * 6 - 180 + 3 + (lon * 180) / Math.PI);

  return { latitude, longitude };
};