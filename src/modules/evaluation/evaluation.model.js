import mongoose from "mongoose";

const monthDetailSchema = new mongoose.Schema(
  {
    position: Number, // 1, 2, 3
    month: String,    // "June"
    year: Number,     // 1993
    monthNum: Number, // 6
    less30: Number,   // 3.65
    avg: Number,      // 6.14
    more30: Number,   // 8.50
    rainfall: Number, // 8.68
    condition: { type: String, enum: ["Dry", "Normal", "Wet"] },
    conditionValue: Number,
    weight: Number,
    score: Number,
  },
  { _id: false }
);

const evaluationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ─── INPUT DATA ───
    observationDate: {
      type: Date,
      required: true,
    },
    location: {
      lat: { type: Number, required: true },
      lon: { type: Number, required: true },
      address: String,
    },

    // ─── RESOLVED DATA ───
    county: String,
    state: String,
    countyFips: String,

    // Station
    station: {
      name: String,
      sid: String,
      lat: Number,
      lon: Number,
      distance: Number, // miles from GPS point
    },

    // Soil
    soilMapUnit: {
      name: String,    // "Kullit-Addielou complex, 1 to 3 percent slopes"
      symbol: String,  // "KuB"
    },

    // Growing season
    growingSeason: {
      threshold: String,   // "28°F"
      probability: String, // "50%"
      startDate: String,   // "3/4"
      endDate: String,     // "11/26"
      totalDays: Number,   // 267
    },

    // ─── CALCULATION RESULTS ───
    monthDetails: [monthDetailSchema],
    totalScore: Number,
    maxScore: { type: Number, default: 18 },
    determination: String,       // "Wetter than Normal"
    simpleLabel: String,         // "WET" | "DRY" | "NORMAL"
    period: String,              // "April - June 1993"
    climateReferencePeriod: {
      type: String,
      default: "1971-2000",
    },

    // ─── METADATA ───
    status: {
      type: String,
      enum: ["evaluated", "insufficient_data", "error"],
      default: "evaluated",
    },

    // Station resolution log (for admin)
    stationLog: [
      {
        stationName: String,
        sid: String,
        distance: Number,
        status: String, // "selected" | "insufficient" | "skipped"
        reason: String,
      },
    ],
  },
  { timestamps: true }
);

// Indexes for fast queries
evaluationSchema.index({ user: 1, createdAt: -1 });
evaluationSchema.index({ countyFips: 1 });
evaluationSchema.index({ simpleLabel: 1 });

export default mongoose.model("Evaluation", evaluationSchema);
