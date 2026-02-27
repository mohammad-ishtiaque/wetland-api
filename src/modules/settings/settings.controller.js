import mongoose from "mongoose";

// ─── Support Ticket Model (inline) ───
const ticketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: String,
    email: String,
    message: String,
    status: { type: String, enum: ["open", "resolved"], default: "open" },
  },
  { timestamps: true }
);

const Ticket = mongoose.model("Ticket", ticketSchema);

// ─── POST /api/v1/settings/contact ───
export const submitContactForm = async (req, res, next) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required",
      });
    }

    const ticket = await Ticket.create({
      user: req.user?._id,
      name,
      email,
      message,
    });

    res.status(201).json({
      success: true,
      message: "Your message has been submitted successfully",
      data: { ticketId: ticket._id },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/v1/settings/terms ───
export const getTerms = async (req, res) => {
  res.json({
    success: true,
    data: {
      title: "Terms & Conditions",
      sections: [
        {
          heading: "Overview Of Our Service",
          content:
            "AgroClima provides wetland climatic determination tools based on NRCS methodology using AgACIS weather data and WETS tables for the 1971-2000 reference period.",
        },
        {
          heading: "User Eligibility",
          content:
            "You must be 18 years or older (or the legal age in your jurisdiction). You agree to provide accurate and up-to-date information. You are responsible for maintaining the confidentiality of your account.",
        },
        {
          heading: "Data Accuracy",
          content:
            "Climate data is sourced from AgACIS/ACIS and NRCS databases. While we strive for accuracy, results should be verified by qualified professionals for regulatory submissions.",
        },
        {
          heading: "Limitation of Liability",
          content:
            "AgroClima is a decision-support tool. Final wetland determinations must be made by qualified professionals in accordance with applicable regulations.",
        },
      ],
      lastUpdated: "2026-01-01",
    },
  });
};

// ─── GET /api/v1/settings/privacy ───
export const getPrivacy = async (req, res) => {
  res.json({
    success: true,
    data: {
      title: "Privacy & Policy",
      sections: [
        {
          heading: "Payments",
          content:
            "All payments are processed securely via Stripe. If a payment fails, your order may be canceled automatically.",
        },
        {
          heading: "Data Collection",
          content:
            "We collect location data (GPS coordinates) solely for the purpose of climate evaluation. This data is stored securely and not shared with third parties.",
        },
        {
          heading: "Cancellations & Refunds",
          content:
            "Refund eligibility depends on timing of cancellation and local policy.",
        },
      ],
      lastUpdated: "2026-01-01",
    },
  });
};
