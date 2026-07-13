# Weather station selection & triangulation logic

Prepared for dlrconsulting, re: your question on triangular logic for weather station selection.

---

## 1. How station selection currently works

The system picks weather stations in two tiers.

Tier 1 is the default: single station. It looks at every station within 50 miles of the site, closest first. For each one it checks two things: a complete 1971-2000 precipitation record, and whether that record has enough data points to be statistically reliable. The first station to pass both is used on its own, no averaging. This covers most locations.

Tier 2, triangulation, only kicks in when Tier 1 comes up empty, meaning no single nearby station has a valid 30-year record. When that happens the system searches again, collects up to three of the nearest stations that pass the same checks, and averages their historical thresholds together (a plain average, not weighted by distance). Same for actual monthly rainfall: for each month it averages whichever stations reported data and skips the ones that didn't.

Here's the part that matters for your question. Triangulation only activates when no single station nearby has valid historical data at all. It doesn't activate when a station has great historical data but its current rainfall reporting has simply stopped. That second case turned out to be common enough that it deserves its own section below.

---

## 2. A real chunk of stations have stopped reporting current data

While testing the calculation endpoint we hit a case in Ocean County, NJ. The system correctly picked the only historically-qualified station nearby, Lakehurst NAS, but its actual recent rainfall came back empty. We traced it to NOAA's own archive: that station's precipitation gauge hasn't reported usable data since August 2002. Confirmed against NOAA's official WETS documentation for the station. Permanent gap, not a bug on our end, not a temporary delay.

To see how common this is we tested the system's real station-selection logic against 16 locations across different US regions, mixing rural areas with spots near major airports.

| Result | Count | Meaning |
|---|---|---|
| Fully working | 9 / 16 (56%) | Selected station has complete recent data |
| Partially working | 2 / 16 (13%) | Selected station has some recent months missing |
| Dead | 5 / 16 (31%) | Selected station has valid history but zero recent data, same failure as Lakehurst NAS |

Every station near a major airport worked, 6 for 6. Every failure was at a small rural station, the kind historically staffed by volunteer observers rather than automated equipment. That network has been shrinking for decades nationwide. Since wetland determinations happen almost exclusively on rural and undeveloped land, this lands right in the middle of your actual use case, not off in some corner.

---

## 3. Proposed fix

Extend the triangulation logic to also kick in when the primary station's recent rainfall is dead, not just when its historical record is missing.

1. Select the best historical-normals station, same as today.
2. Try recent rainfall from that same station first. Same as today, for when it works.
3. If that station's recent data is dead, try the next-nearest historically-qualified stations for recent rainfall instead.
4. If none of those have current data either (this is exactly the Lakehurst NAS situation, it was the only qualified station in range), fall back to the nearest station of any type nearby for recent rainfall, even one without a full 30-year record, while still using the original station's historical normals for comparison.

Every fallback step gets logged in the response, so you can always tell which station supplied which number.

One thing needs your sign-off before we build this. Step 4 means the historical-normal comparison and the actual rainfall could come from two different physical stations. That's standard practice in the field, it's how USACE's own Antecedent Precipitation Tool handles precipitation versus temperature stations, but it's a methodology call, not just an engineering one. We'd like your confirmation, or your reviewer's, that pulling the two figures from different nearby stations is fine for your determinations before we build it.

---

## 4. What we need from you

1. Are you okay with historical normals and recent rainfall coming from two different stations when the primary station's recent data is dead?
2. Build this now, or leave current behavior as-is for now? (The system already reports "Insufficient data" honestly in these cases instead of guessing.)

Happy to walk through the raw test data or a live example on a call if that's easier.
