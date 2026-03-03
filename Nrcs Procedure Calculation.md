# NRCS Procedure 2 — Climatic Determination
## How Wetland Hydrology Wetness is Determined

---

## 1. Purpose and Official Reference

This API implements **NRCS (National Resources Conservation Service) Procedure 2: Climatic Determination**, as defined in:

> **USDA-NRCS, "Field Indicators of Hydric Soils in the United States"**  
> and  
> **USDA-NRCS Technical Standard — "Wetland Hydrology Determination using Climatic Analysis (Procedure 2)"**  
> National Food Security Act Manual (NFSAM), Part 514.

The purpose of this procedure is to determine whether **recent precipitation conditions** at a given location were **wetter than normal, normal, or drier than normal** during the 3 months immediately before a site visit (observation date). This is used as supporting evidence for wetland hydrology determinations required under federal law (Section 404 of the Clean Water Act).

---

## 2. Core Concept

The method compares **actual recent rainfall** to **long-term historical norms (WETS data, 1971–2000)** for the same months, at the nearest representative weather station. Each of the 3 prior months is classified as Dry, Normal, or Wet, then a **weighted score** is computed. The total score maps to a final determination category.

---

## 3. Input Data

| Input | Source | Description |
|---|---|---|
| `observationDate` | User-provided | The date the site was visited (YYYY-MM-DD) |
| [lat](file:///c:/Users/arifi/OneDrive/Documents/All%20Projects/Backend/wetland-api/src/modules/evaluation/evaluation.controller.js#14-181) / `lon` | User GPS | Coordinates of the evaluation site |
| **WETS normals** | ACIS / NOAA | 30th / average / 70th percentile monthly precip for 1971–2000 |
| **Actual rainfall** | ACIS live data | Monthly precipitation totals for the 3 prior months |

---

## 4. Step-by-Step Calculation

### Step 1 — Identify the 3 Prior Months

From the `observationDate`, the system automatically identifies the **3 calendar months immediately before** the observation month.

**Example:**
```
observationDate = 2024-11-15
→ Prior months:
    1st prior (most recent): October 2024
    2nd prior:               September 2024
    3rd prior:               August 2024
```

> **Why 3 months?**  
> The NRCS standard specifies that wetland hydrology assessment must account for antecedent moisture conditions. The 3 prior months capture the typical recharge period for shallow water tables.

---

### Step 2 — Find the Nearest WETS-Qualified Weather Station

The system searches for weather stations within a configurable radius (default **100 miles**) of the site coordinates, using the **ACIS (Applied Climate Information System)** from NOAA's Regional Climate Centers.

A station is considered **WETS-qualified** only if it has:
- Continuous precipitation records that **cover the entire 1971–2000 period**
- A minimum of **10 usable monthly values per calendar month** in that period

> If no qualifying station is found within 100 miles, the API returns a `404` with a full `stationLog` explaining why each station was skipped.

---

### Step 3 — Derive WETS Thresholds (30th / Average / 70th Percentile)

For each of the 12 calendar months, the WETS thresholds are computed from the 30-year record (1971–2000):

```
For a given calendar month (e.g. October):
  1. Collect all 30 October precipitation values (1971, 1972, ..., 2000)
  2. Remove missing values ("M" = missing, "T" = trace → treated as 0)
  3. Sort values ascending
  4. less30 = value at the 30th percentile index  (≈ idx = floor(n × 0.30))
  5. avg    = arithmetic mean of all valid values
  6. more30 = value at the 70th percentile index  (≈ idx = floor(n × 0.70))
```

> **NRCS Note:** The official WETS tables use a **gamma distribution** to estimate the 30th and 70th percentiles from 30-year data. This implementation uses a **direct empirical percentile** (sorted array index), which is a valid and widely-accepted approximation when ≥ 10 data points are available.

---

### Step 4 — Classify Each Month: Dry / Normal / Wet

Each prior month's **actual rainfall total** is compared against the WETS thresholds for that calendar month:

```
IF actual_rainfall ≤ less30   → Condition = "Dry"
IF actual_rainfall ≥ more30   → Condition = "Wet"
IF less30 < actual < more30   → Condition = "Normal"
```

**In numbers:**

| Condition | Meaning | Numeric Value |
|---|---|---|
| **Dry** | Rainfall was in the driest 30% historically | **1** |
| **Normal** | Rainfall was in the middle 40% historically | **2** |
| **Wet** | Rainfall was in the wettest 30% historically | **3** |

---

### Step 5 — Apply Month Weights

The **most recent prior month has the greatest influence** on current soil moisture conditions. The NRCS standard assigns decreasing weights:

| Month Position | Role | Weight |
|---|---|---|
| 1st prior (most recent) | Highest impact | **3** |
| 2nd prior | Medium impact | **2** |
| 3rd prior | Lowest impact | **1** |

**Score for each month:**
```
Month Score = Condition Value × Weight
```

**Total Score:**
```
Total Score = (V₁ × 3) + (V₂ × 2) + (V₃ × 1)
```

Where `V₁`, `V₂`, `V₃` are the condition values for the 1st, 2nd, and 3rd prior months respectively.

---

### Step 6 — Final Determination from Total Score

The total score falls in the range **6 to 18**:

| Total Score | `simpleLabel` | `determination` (full text) |
|---|---|---|
| **6 – 9** | `DRY` | Drier than Normal |
| **10 – 14** | `NORMAL` | Normal |
| **15 – 18** | `WET` | Wetter than Normal |

The maximum possible score (18) occurs when all 3 months are Wet (3×3 + 2×3 + 1×3 = 18).  
The minimum possible score (6) occurs when all 3 months are Dry (1×3 + 1×2 + 1×1 = 6).

---

### Step 7 — Compute Growing Season (50% Probability ≥ 28°F)

The API also calculates the **median (50th percentile) growing season**, as required for the `additionalInfo` UI card.

**Process:**
1. Fetch 30 years (1971–2000) of **daily minimum temperature** from ACIS for the selected station.
2. For each year:
   - Find the **last spring freeze** (last day before summer where temp ≤ 28°F).
   - Find the **first fall freeze** (first day after summer where temp ≤ 28°F).
3. Convert these dates to Day-Of-Year (1 to 365).
4. Sort the 30 spring DOYs and 30 fall DOYs.
5. Take the **median (50th percentile)** from each sorted list.
6. The growing season is the gap between the median spring freeze and median fall freeze.

**Output Example:**
```json
"growingSeason": "March 4 - November 26 (267 days)"
```

---

## 5. Worked Example

**Site:** Travis County, Texas  
**Observation Date:** 2024-11-10  
**Station:** Austin Camp Mabry (COOP ID: 410429)

### Prior Months

| Position | Month | Actual Rainfall | WETS less30 | WETS avg | WETS more30 | Condition | Value | Weight | Score |
|---|---|---|---|---|---|---|---|---|---|
| 1st prior | October 2024 | 5.20 in | 1.10 in | 2.85 in | 4.40 in | **Wet** | 3 | 3 | **9** |
| 2nd prior | September 2024 | 2.10 in | 1.40 in | 3.10 in | 4.80 in | **Normal** | 2 | 2 | **4** |
| 3rd prior | August 2024 | 0.30 in | 0.80 in | 2.20 in | 3.50 in | **Dry** | 1 | 1 | **1** |

**Total Score = 9 + 4 + 1 = 14 → NORMAL**

---

## 6. Edge Cases and How They Are Handled

### 6.1 Missing Rainfall Data ("M" values)
ACIS returns `"M"` when no observation was recorded for that month.

**Handling:** The month is marked with `condition: null` and `score: null`. If any of the 3 months has null data, `hasAllData = false` and the determination is returned as `null` (cannot be computed). The raw `rainfallRecord` still shows the available months.

---

### 6.2 Trace Rainfall ("T" values)
ACIS returns `"T"` for precipitation amounts too small to measure (< 0.005 in).

**Handling:** Trace values are treated as **0.00 inches**. This is consistent with NRCS and NOAA standards.

---

### 6.3 Insufficient WETS Data for a Month
A station may have fewer than 10 valid October values in the 1971–2000 period due to gaps or station relocations.

**Handling:** That month's WETS entry is flagged `{ insufficient: true }`. The month score is set to `null` and the final determination cannot be made. The `stationLog` records why this station was skipped and the system tries the next nearest station.

---

### 6.4 No Station Within 100 Miles
Some remote areas (e.g. parts of Nevada, Wyoming) may have no COOP station within the configured radius.

**Handling:** The API returns HTTP `404` with:
```json
{
  "success": false,
  "message": "No AgACIS WETS station with sufficient data found within 100 miles",
  "data": { "stationLog": [...], "totalStationsChecked": 7 }
}
```
The `stationLog` lists every station that was checked and the specific reason it was rejected.

---

### 6.5 Observation Date Within the Current Month
If the observation date is in the current month, the "1st prior month" is the previous calendar month (not the current month), which is correct — the current month's rainfall is not yet complete.

**Example:**
```
observationDate = 2024-02-03
→ 1st prior = January 2024
→ 2nd prior = December 2023
→ 3rd prior = November 2023
```

---

### 6.6 Year Boundary (January observation)
When the observation is in January, February, or March, the prior months span across a year boundary.

**Example:**
```
observationDate = 2024-02-15
→ 1st prior = January 2024
→ 2nd prior = December 2023  ← previous year
→ 3rd prior = November 2023  ← previous year
```
The system handles this correctly using JavaScript's [Date](file:///c:/Users/arifi/OneDrive/Documents/All%20Projects/Backend/wetland-api/src/utils/acisService.js#326-332) arithmetic, which automatically rolls back across the year boundary.

---

### 6.7 Rainfall Exactly Equal to a Threshold
The boundary conditions are inclusive:
- `actual ≤ less30` → **Dry** (not Normal)
- `actual ≥ more30` → **Wet** (not Normal)

This means a value sitting exactly on the 30th percentile line is classified as Dry, and exactly on the 70th percentile line is classified as Wet. This matches the NRCS specification.

---

### 6.8 State/County Search with No Stations in County
Some US counties have no COOP weather station within their boundaries in the ACIS database.

**Handling (calculate-by-location):** The API returns HTTP `404`. The frontend should prompt the user to try the lat/lon search instead, which uses a bounding box that crosses county boundaries to find the nearest available station.

---

### 6.9 Soil Map Unit Lookup Failure
The NRCS Soil Data Access (SDA) API may be unavailable or return no record for a given coordinate (e.g. open water, urban areas with no mapped soil unit).

**Handling:** `soilMapUnit` in `additionalInfo` is returned as `"Not available"`. This does not affect the climatic determination score.

---

## 7. API Response Field Reference

| Field | Meaning |
|---|---|
| `simpleLabel` | `"DRY"` / `"NORMAL"` / `"WET"` — for UI badges |
| `determination` | Full text: `"Drier than Normal"` / `"Normal"` / `"Wetter than Normal"` |
| `totalScore` | Weighted sum (6–18) |
| `maxScore` | Always 18 |
| `period` | e.g. `"August - October 2024"` |
| `rainfallRecord[].less30` | 30th percentile WETS threshold for that month (inches) |
| `rainfallRecord[].avg` | 30-year mean precipitation for that month (inches) |
| `rainfallRecord[].more30` | 70th percentile WETS threshold for that month (inches) |
| `rainfallRecord[].rainfall` | Actual recorded precipitation (inches) |
| `rainfallRecord[].condition` | `"Dry"` / `"Normal"` / `"Wet"` / `null` |
| `station.distance` | Miles from site GPS to the WETS station used |
| `climateReferencePeriod` | Always `"1971-2000"` — the WETS baseline period |
| `stationLog` | List of all stations checked, with acceptance/rejection reason |

---

## 8. Official Reference Documents

| Resource | Description |
|---|---|
| [USDA-NRCS Wetland Conservation](https://www.nrcs.usda.gov/programs-initiatives/agriculture-conservation-easement-program-wetland-reserve-easements) | Official NRCS wetland program |
| [NFSAM Part 514 — Wetland Determination Procedures](https://directives.sc.egov.usda.gov/) | Authoritative procedure document |
| [WETS Climate Data Tables](https://www.wcc.nrcs.usda.gov/climate/wets.html) | Official WETS station data by state |
| [ACIS Web Services Documentation](https://www.rcc-acis.org/docs_webservices.html) | ACIS API used to fetch station data |
| [NRCS Soil Data Access](https://sdmdataaccess.sc.egov.usda.gov/) | SDA API used for soil map unit lookup |
| [FCC Area API](https://geo.fcc.gov/api/census/) | Used for reverse geocoding (lat/lon → county FIPS) |
