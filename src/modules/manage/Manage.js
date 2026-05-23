import mongoose from "mongoose";

const { model } = mongoose;

const termsAndConditionsSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const privacySchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER", "SCHOOL"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const aboutUsSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const contactUsSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    facebookLink: {
      type: String,
    },
    linkedinLink: {
      type: String,
    },
    instagramLink: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const supportSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      default: "",
    },
    opinion: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED"],
      default: "PENDING",
    },
  },
  {
    timestamps: true,
  }
);

export const PrivacyPolicy = model("PrivacyPolicy", privacySchema);
export const TermsConditions = model("TermsConditions", termsAndConditionsSchema);
export const FAQ = model("FAQ", faqSchema);
export const AboutUs = model("AboutUs", aboutUsSchema);
export const ContactUs = model("ContactUs", contactUsSchema);
export const Support = model("Support", supportSchema);
