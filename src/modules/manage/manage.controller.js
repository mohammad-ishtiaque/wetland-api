import * as manageService from "./manage.service.js";

const respond = (res, statusCode, message, data, meta) => {
  const payload = {
    success: true,
    message,
    data,
  };

  if (meta) {
    payload.meta = meta;
  }

  res.status(statusCode).json(payload);
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const sanitizeDocumentHtml = (value = "") =>
  String(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\sjavascript:/gi, "");

const renderDocumentPage = (title, body) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        padding: 32px 16px;
        background: #f7f4ec;
        color: #1f2937;
        font-family: Georgia, "Times New Roman", serif;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 40px 28px;
        background: #fffdf8;
        border: 1px solid #e5ded1;
        border-radius: 16px;
        box-shadow: 0 12px 30px rgba(31, 41, 55, 0.08);
      }
      h1 {
        margin-top: 0;
        margin-bottom: 20px;
        font-size: 2rem;
        line-height: 1.2;
        color: #102a43;
      }
      .content {
        line-height: 1.8;
        font-size: 1rem;
      }
      .content h1,
      .content h2,
      .content h3,
      .content h4 {
        color: #1f3c58;
        line-height: 1.3;
        margin: 28px 0 12px;
      }
      .content h1:first-child,
      .content h2:first-child,
      .content h3:first-child,
      .content h4:first-child {
        margin-top: 0;
      }
      .content p {
        margin: 0 0 16px;
      }
      .content ul,
      .content ol {
        margin: 0 0 20px 24px;
      }
      .content li {
        margin-bottom: 10px;
      }
      .content a {
        color: #9f2d20;
      }
      .content strong {
        color: #102a43;
      }
      .content hr {
        border: 0;
        border-top: 1px solid #e5ded1;
        margin: 28px 0;
      }
      .empty {
        color: #6b7280;
        font-style: italic;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <div class="content">${body}</div>
    </main>
  </body>
</html>`;

export const addTermsConditions = async (req, res, next) => {
  try {
    const result = await manageService.addTermsConditions(req.body);
    respond(
      res,
      200,
      result.message ?? "Successful",
      result.result ?? result
    );
  } catch (error) {
    next(error);
  }
};

export const getTermsConditions = async (req, res, next) => {
  try {
    const result = await manageService.getTermsConditions();
    respond(res, 200, "Successful", result);
  } catch (error) {
    next(error);
  }
};

export const viewTermsConditions = async (req, res, next) => {
  try {
    const result = await manageService.getTermsConditions();

    if (!result) {
      return res
        .status(404)
        .type("html")
        .send(
          renderDocumentPage(
            "Terms and Conditions",
            '<p class="empty">Terms and conditions were not found.</p>'
          )
        );
    }

    return res
      .status(200)
      .type("html")
      .send(
        renderDocumentPage(
          "Terms and Conditions",
          sanitizeDocumentHtml(result.description)
        )
      );
  } catch (error) {
    next(error);
  }
};

export const deleteTermsConditions = async (req, res, next) => {
  try {
    const result = await manageService.deleteTermsConditions(req.query);
    respond(res, 200, "Deletion Successful", result);
  } catch (error) {
    next(error);
  }
};

export const addPrivacyPolicy = async (req, res, next) => {
  try {
    const result = await manageService.addPrivacyPolicy(req.body);
    respond(
      res,
      200,
      result.message ?? "Successful",
      result.result ?? result
    );
  } catch (error) {
    next(error);
  }
};

export const getPrivacyPolicy = async (req, res, next) => {
  try {
    const result = await manageService.getPrivacyPolicy();
    respond(res, 200, "Successful", result);
  } catch (error) {
    next(error);
  }
};

export const viewPrivacyPolicy = async (req, res, next) => {
  try {
    const result = await manageService.getPrivacyPolicy();

    if (!result) {
      return res
        .status(404)
        .type("html")
        .send(
          renderDocumentPage(
            "Privacy Policy",
            '<p class="empty">Privacy policy was not found.</p>'
          )
        );
    }

    return res
      .status(200)
      .type("html")
      .send(
        renderDocumentPage(
          "Privacy Policy",
          sanitizeDocumentHtml(result.description)
        )
      );
  } catch (error) {
    next(error);
  }
};

export const deletePrivacyPolicy = async (req, res, next) => {
  try {
    const result = await manageService.deletePrivacyPolicy(req.query);
    respond(res, 200, "Deletion Successful", result);
  } catch (error) {
    next(error);
  }
};

export const addAboutUs = async (req, res, next) => {
  try {
    const result = await manageService.addAboutUs(req.body);
    respond(
      res,
      200,
      result.message ?? "Successful",
      result.result ?? result
    );
  } catch (error) {
    next(error);
  }
};

export const getAboutUs = async (req, res, next) => {
  try {
    const result = await manageService.getAboutUs();
    respond(res, 200, "Successful", result);
  } catch (error) {
    next(error);
  }
};

export const deleteAboutUs = async (req, res, next) => {
  try {
    const result = await manageService.deleteAboutUs(req.query);
    respond(res, 200, "Deletion Successful", result);
  } catch (error) {
    next(error);
  }
};

export const addFaq = async (req, res, next) => {
  try {
    const result = await manageService.addFaq(req.body);
    respond(
      res,
      200,
      result.message ?? "Successful",
      result.result ?? result
    );
  } catch (error) {
    next(error);
  }
};

export const updateFaq = async (req, res, next) => {
  try {
    const result = await manageService.updateFaq(req.body);
    respond(
      res,
      200,
      result.message ?? "Successful",
      result.result ?? result
    );
  } catch (error) {
    next(error);
  }
};

export const getFaq = async (req, res, next) => {
  try {
    const result = await manageService.getFaq(req.query);
    respond(res, 200, "Successful", result);
  } catch (error) {
    next(error);
  }
};

export const deleteFaq = async (req, res, next) => {
  try {
    const result = await manageService.deleteFaq(req.query);
    respond(res, 200, "Deletion Successful", result);
  } catch (error) {
    next(error);
  }
};

export const addContactUs = async (req, res, next) => {
  try {
    const result = await manageService.addContactUs(req.body);
    respond(
      res,
      200,
      result.message ?? "Successful",
      result.result ?? result
    );
  } catch (error) {
    next(error);
  }
};

export const getContactUs = async (req, res, next) => {
  try {
    const result = await manageService.getContactUs();
    respond(res, 200, "Successful", result);
  } catch (error) {
    next(error);
  }
};

export const deleteContactUs = async (req, res, next) => {
  try {
    const result = await manageService.deleteContactUs(req.query);
    respond(res, 200, "Deletion Successful", result);
  } catch (error) {
    next(error);
  }
};

export const addSupport = async (req, res, next) => {
  try {
    const result = await manageService.addSupport(req.body);
    respond(res, 201, "Support request created successfully", result);
  } catch (error) {
    next(error);
  }
};

export const getSupport = async (req, res, next) => {
  try {
    const result = await manageService.getSupport(req.query);
    respond(
      res,
      200,
      "Support requests retrieved successfully",
      result.supports,
      result.meta
    );
  } catch (error) {
    next(error);
  }
};

export const getSupportById = async (req, res, next) => {
  try {
    const result = await manageService.getSupportById(req.params.id);
    respond(res, 200, "Support request retrieved successfully", result);
  } catch (error) {
    next(error);
  }
};

export const updateSupportStatus = async (req, res, next) => {
  try {
    const result = await manageService.updateSupportStatus(req.params.id, req.body);
    respond(res, 200, "Support status updated successfully", result);
  } catch (error) {
    next(error);
  }
};

export const deleteSupport = async (req, res, next) => {
  try {
    const result = await manageService.deleteSupport(req.params.id);
    respond(res, 200, "Support request deleted successfully", result);
  } catch (error) {
    next(error);
  }
};
