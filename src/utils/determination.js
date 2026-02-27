import {
  CONDITION,
  CONDITION_VALUE,
  MONTH_WEIGHTS,
  DETERMINATION,
} from "../config/constants.js";

/**
 * Run NRCS Procedure 2 Climatic Determination
 *
 * @param {Array} priorMonths - [{name, num, year}, ...] (1st, 2nd, 3rd prior)
 * @param {Object} wetsData - {months: {1: {avg, less30, more30}, ...}}
 * @param {Object} actualRainfall - {monthNum: {value}, ...}
 * @returns {Object} determination result
 */
export const calculateDetermination = (priorMonths, wetsData, actualRainfall) => {
  const monthDetails = [];
  let totalScore = 0;

  for (let i = 0; i < 3; i++) {
    const m = priorMonths[i];
    const wets = wetsData.months[m.num];
    const actual = actualRainfall[m.num]?.value;

    // Handle missing data
    if (actual === null || actual === undefined || !wets || wets.insufficient) {
      monthDetails.push({
        position: i + 1,
        month: m.name,
        year: m.year,
        monthNum: m.num,
        less30: wets?.less30 ?? null,
        avg: wets?.avg ?? null,
        more30: wets?.more30 ?? null,
        rainfall: actual ?? null,
        condition: null,
        conditionValue: null,
        weight: MONTH_WEIGHTS[i],
        score: null,
        error: "Insufficient data",
      });
      continue;
    }

    // Classify: Dry / Normal / Wet
    let condition;
    if (actual <= wets.less30) {
      condition = CONDITION.DRY;
    } else if (actual >= wets.more30) {
      condition = CONDITION.WET;
    } else {
      condition = CONDITION.NORMAL;
    }

    const conditionValue = CONDITION_VALUE[condition];
    const weight = MONTH_WEIGHTS[i];
    const score = conditionValue * weight;
    totalScore += score;

    monthDetails.push({
      position: i + 1,
      month: m.name,
      year: m.year,
      monthNum: m.num,
      less30: wets.less30,
      avg: wets.avg,
      more30: wets.more30,
      rainfall: actual,
      condition,
      conditionValue,
      weight,
      score,
    });
  }

  // Check if we have enough data for determination
  const hasAllData = monthDetails.every((m) => m.score !== null);

  let determination = null;
  if (hasAllData) {
    if (totalScore >= DETERMINATION.DRY.min && totalScore <= DETERMINATION.DRY.max) {
      determination = DETERMINATION.DRY.label;
    } else if (totalScore >= DETERMINATION.NORMAL.min && totalScore <= DETERMINATION.NORMAL.max) {
      determination = DETERMINATION.NORMAL.label;
    } else if (totalScore >= DETERMINATION.WET.min && totalScore <= DETERMINATION.WET.max) {
      determination = DETERMINATION.WET.label;
    }
  }

  // Simple label for UI (WET / DRY / NORMAL)
  let simpleLabel = null;
  if (determination) {
    if (totalScore <= 9) simpleLabel = "DRY";
    else if (totalScore <= 14) simpleLabel = "NORMAL";
    else simpleLabel = "WET";
  }

  return {
    monthDetails,
    totalScore,
    maxScore: 18,
    determination,
    simpleLabel,
    hasAllData,
    period: `${priorMonths[2].name} - ${priorMonths[0].name} ${priorMonths[0].year}`,
  };
};
