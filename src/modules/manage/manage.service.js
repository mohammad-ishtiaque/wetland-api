import mongoose from "mongoose";
import {
  TermsConditions,
  PrivacyPolicy,
  AboutUs,
  FAQ,
  ContactUs,
  Support,
} from "./Manage.js";

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const requireFields = (payload, fields) => {
  for (const field of fields) {
    const value = payload?.[field];
    if (value === undefined || value === null || value === "") {
      throw createHttpError(400, `${field} is required`);
    }
  }
};

const getPositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  const result = Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  return max ? Math.min(result, max) : result;
};

export const addTermsConditions = async (payload) => {
  const checkIsExist = await TermsConditions.findOne();

  if (checkIsExist) {
    const result = await TermsConditions.findOneAndUpdate({}, payload, {
      new: true,
      runValidators: true,
    });

    return {
      message: "Terms & conditions updated",
      result,
    };
  }

  return TermsConditions.create(payload);
};

export const getTermsConditions = async () => TermsConditions.findOne();

export const deleteTermsConditions = async (query) => {
  requireFields(query, ["id"]);

  const result = await TermsConditions.deleteOne({ _id: query.id });

  if (!result.deletedCount) {
    throw createHttpError(404, "TermsConditions not found");
  }

  return result;
};

export const addPrivacyPolicy = async (payload) => {
  const checkIsExist = await PrivacyPolicy.findOne();

  if (checkIsExist) {
    const result = await PrivacyPolicy.findOneAndUpdate({}, payload, {
      new: true,
      runValidators: true,
    });

    return {
      message: "Privacy policy updated",
      result,
    };
  }

  return PrivacyPolicy.create(payload);
};

export const getPrivacyPolicy = async () => PrivacyPolicy.findOne();

export const deletePrivacyPolicy = async (query) => {
  requireFields(query, ["id"]);

  const result = await PrivacyPolicy.deleteOne({ _id: query.id });

  if (!result.deletedCount) {
    throw createHttpError(404, "Privacy Policy not found");
  }

  return result;
};

export const addAboutUs = async (payload) => {
  const checkIsExist = await AboutUs.findOne();

  if (checkIsExist) {
    const result = await AboutUs.findOneAndUpdate({}, payload, {
      new: true,
      runValidators: true,
    });

    return {
      message: "About Us updated",
      result,
    };
  }

  return AboutUs.create(payload);
};

export const getAboutUs = async () => AboutUs.findOne();

export const deleteAboutUs = async (query) => {
  requireFields(query, ["id"]);

  const result = await AboutUs.deleteOne({ _id: query.id });

  if (!result.deletedCount) {
    throw createHttpError(404, "About Us not found");
  }

  return result;
};

export const addFaq = async (payload) => {
  requireFields(payload, ["question", "description", "role"]);
  return FAQ.create(payload);
};

export const updateFaq = async (payload) => {
  requireFields(payload, ["faqId", "question", "description", "role"]);

  const { faqId, ...rest } = payload;
  const result = await FAQ.findOneAndUpdate({ _id: faqId }, rest, {
    new: true,
    runValidators: true,
  });

  if (!result) {
    throw createHttpError(404, "FAQ not found");
  }

  return result;
};

export const getFaq = async (query) => {
  requireFields(query, ["role"]);
  return FAQ.find({ role: query.role });
};

export const deleteFaq = async (query) => {
  requireFields(query, ["faqId"]);

  const result = await FAQ.deleteOne({ _id: query.faqId });

  if (!result.deletedCount) {
    throw createHttpError(404, "FAQ not found");
  }

  return result;
};

export const addContactUs = async (payload) => {
  const checkIsExist = await ContactUs.findOne();

  if (checkIsExist) {
    const result = await ContactUs.findOneAndUpdate({}, payload, {
      new: true,
      runValidators: true,
    });

    return {
      message: "Contact Us updated",
      result,
    };
  }

  return ContactUs.create(payload);
};

export const getContactUs = async () => ContactUs.findOne({});

export const deleteContactUs = async (query) => {
  requireFields(query, ["id"]);

  const result = await ContactUs.deleteOne({ _id: query.id });

  if (!result.deletedCount) {
    throw createHttpError(404, "Contact Us not found");
  }

  return result;
};

export const addSupport = async (payload) => {
  requireFields(payload, ["subject", "opinion"]);
  return Support.create(payload);
};

export const getSupport = async (query) => {
  const page = getPositiveInt(query?.page, 1);
  // Capped at 100 — previously unbounded, so a request could pull the
  // entire Support collection in a single page.
  const limit = getPositiveInt(query?.limit, 10, 100);
  const skip = (page - 1) * limit;

  const filters = {};

  if (query?.status) {
    filters.status = query.status;
  }

  if (query?.searchTerm) {
    const searchRegex = new RegExp(query.searchTerm, "i");
    filters.$or = [
      { subject: searchRegex },
      { opinion: searchRegex },
    ];
  }

  const sortBy = query?.sortBy || "createdAt";
  const sortOrder = query?.sortOrder === "asc" ? 1 : -1;

  const [supports, total] = await Promise.all([
    Support.find(filters)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    Support.countDocuments(filters),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
    supports,
  };
};

export const getSupportById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(400, "Invalid support ID");
  }

  const support = await Support.findById(id).lean();

  if (!support) {
    throw createHttpError(404, "Support request not found");
  }

  return support;
};

export const updateSupportStatus = async (id, payload) => {
  requireFields(payload, ["status"]);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(400, "Invalid support ID");
  }

  const validStatuses = ["PENDING", "COMPLETED"];
  if (!validStatuses.includes(payload.status)) {
    throw createHttpError(400, "Invalid status. Must be PENDING or COMPLETED");
  }

  const support = await Support.findByIdAndUpdate(
    id,
    { status: payload.status },
    { new: true, runValidators: true }
  ).lean();

  if (!support) {
    throw createHttpError(404, "Support request not found");
  }

  return support;
};

export const deleteSupport = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(400, "Invalid support ID");
  }

  const result = await Support.deleteOne({ _id: id });

  if (!result.deletedCount) {
    throw createHttpError(404, "Support request not found");
  }

  return result;
};
