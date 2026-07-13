// scripts/station-health-check.mjs
//
// Diagnostic: for a geographically-diverse sample of US locations, this
// replicates the app's OWN station-selection logic (the same loop from
// evaluation.controller.js calculate() Step 3 — pick the closest station
// with valid 1971-2000 WETS coverage) to see which station the real app
// would pick, then checks whether that station's ACTUAL recent (last 3
// calendar months) precipitation data is available.
//
// This is exactly the same failure mode diagnosed for Lakehurst NAS, NJ:
// a station can have perfectly good 30-year historical normals (so it gets
// selected) while its recent/current precipitation reporting has quietly
// died — sometimes decades ago. This script finds out how common that is
// across a spread of other US locations.
//
// Run from the project root:
//   node scripts/station-health-check.mjs
//
// Needs real internet access to ACIS (data.rcc-acis.org) — run this on your
// machine, not in a restricted sandbox.

import { findStationsByBBox, getWetsData, getMonthlyPrecipitation } from "../src/utils/acisService.js";
import { getPriorMonths } from "../src/utils/geo.js";
import { MAX_STATION_DISTANCE_MILES } from "../src/config/constants.js";

// Deliberately mixes rural locations (more likely to depend on old
// volunteer-network COOP stations, which have a well-documented history of
// discontinuing over the decades) with locations near major airports (more
// likely to be automated ASOS stations with continuous reporting), spread
// across different US climate regions — to see whether this problem
// clusters in rural areas or is more widespread than that.
const TEST_LOCATIONS = [
  { label: "Rural Ocean County, NJ (baseline — known bad, Lakehurst NAS)", lat: 40.116081, lon: -74.406440 },
  { label: "Near JFK Airport, NY", lat: 40.6413, lon: -73.7781 },
  { label: "Rural northern Vermont", lat: 44.9333, lon: -72.6333 },
  { label: "Rural eastern Montana", lat: 47.1164, lon: -104.7942 },
  { label: "Texas Panhandle (rural)", lat: 35.2220, lon: -101.8313 },
  { label: "Rural south Georgia", lat: 31.1667, lon: -83.7833 },
  { label: "Rural central Iowa", lat: 42.0308, lon: -93.6319 },
  { label: "California Central Valley (rural)", lat: 36.7378, lon: -119.7871 },
  { label: "Near Chicago O'Hare Airport, IL", lat: 41.9742, lon: -87.9073 },
  { label: "Rural Mississippi Delta", lat: 33.4735, lon: -90.7326 },
  { label: "Rural eastern Oregon", lat: 44.0582, lon: -117.9556 },
  { label: "Rural eastern New Mexico", lat: 34.1795, lon: -103.3313 },
  { label: "Near Atlanta Hartsfield Airport, GA", lat: 33.6407, lon: -84.4277 },
  { label: "Rural northern Maine", lat: 46.6875, lon: -68.0170 },
  { label: "Rural western Kansas", lat: 38.4783, lon: -100.9046 },
  { label: "Rural southern Arizona", lat: 31.9126, lon: -110.9426 },
];

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const today = fmtDate(new Date());
  const priorMonths = getPriorMonths(today);
  console.log(`Diagnostic run — "today" = ${today}`);
  console.log(
    `Checking recent-data availability for: ${priorMonths
      .slice()
      .reverse()
      .map((m) => `${m.name} ${m.year}`)
      .join(", ")}`
  );
  console.log("=".repeat(100));

  const results = [];

  for (const loc of TEST_LOCATIONS) {
    process.stdout.write(`\nChecking: ${loc.label} (${loc.lat}, ${loc.lon}) ... `);
    try {
      const stations = await findStationsByBBox(loc.lat, loc.lon, MAX_STATION_DISTANCE_MILES);

      let selectedStation = null;
      for (const station of stations) {
        if (station.distance > MAX_STATION_DISTANCE_MILES) break;
        if (!station.hasPrecipData) continue;
        const wets = await getWetsData(station.sid);
        if (wets.isInsufficient) continue;
        selectedStation = station;
        break;
      }

      if (!selectedStation) {
        console.log("NO WETS-VALID STATION FOUND within range (different issue — no 30yr coverage nearby at all)");
        results.push({ ...loc, verdict: "NO_STATION" });
        continue;
      }

      const rainfall = await getMonthlyPrecipitation(
        selectedStation.sid,
        priorMonths[2].num,
        priorMonths[2].year,
        priorMonths[0].num,
        priorMonths[0].year
      );

      const monthsWithData = Object.values(rainfall).filter((m) => m.value !== null).length;
      const totalMonths = priorMonths.length;

      if (monthsWithData === 0) {
        console.log(
          `DEAD — station "${selectedStation.name}" (sid ${selectedStation.sid}, ${selectedStation.distance.toFixed(
            1
          )}mi) has WETS history but 0/${totalMonths} recent months have data`
        );
        results.push({
          ...loc,
          station: selectedStation.name,
          sid: selectedStation.sid,
          distance: selectedStation.distance,
          verdict: "DEAD",
        });
      } else if (monthsWithData < totalMonths) {
        console.log(
          `PARTIAL — station "${selectedStation.name}" (sid ${selectedStation.sid}, ${selectedStation.distance.toFixed(
            1
          )}mi) has ${monthsWithData}/${totalMonths} recent months`
        );
        results.push({
          ...loc,
          station: selectedStation.name,
          sid: selectedStation.sid,
          distance: selectedStation.distance,
          verdict: "PARTIAL",
        });
      } else {
        console.log(
          `OK — station "${selectedStation.name}" (sid ${selectedStation.sid}, ${selectedStation.distance.toFixed(
            1
          )}mi) has all ${totalMonths} recent months`
        );
        results.push({
          ...loc,
          station: selectedStation.name,
          sid: selectedStation.sid,
          distance: selectedStation.distance,
          verdict: "OK",
        });
      }
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      results.push({ ...loc, verdict: "ERROR", error: err.message });
    }
  }

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY");
  console.log("=".repeat(100));
  const dead = results.filter((r) => r.verdict === "DEAD");
  const partial = results.filter((r) => r.verdict === "PARTIAL");
  const ok = results.filter((r) => r.verdict === "OK");
  const noStation = results.filter((r) => r.verdict === "NO_STATION");
  const errors = results.filter((r) => r.verdict === "ERROR");

  console.log(`Total locations tested: ${results.length}`);
  console.log(`  OK (full recent data):                                                     ${ok.length}`);
  console.log(`  PARTIAL (some months missing):                                              ${partial.length}`);
  console.log(`  DEAD (WETS-valid station but zero recent data — same issue as Lakehurst NAS): ${dead.length}`);
  console.log(`  NO_STATION (no WETS-valid station nearby at all — different issue):          ${noStation.length}`);
  console.log(`  ERROR:                                                                       ${errors.length}`);

  if (dead.length > 0) {
    console.log(`\nDEAD stations (same failure mode as Lakehurst NAS):`);
    dead.forEach((r) => console.log(`  - ${r.label}: "${r.station}" (sid ${r.sid})`));
  }
  if (partial.length > 0) {
    console.log(`\nPARTIAL stations (worth a closer look):`);
    partial.forEach((r) => console.log(`  - ${r.label}: "${r.station}" (sid ${r.sid})`));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
