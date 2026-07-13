export const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
};

export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err.stack);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(", ") });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  // Mongoose CastError — almost always a malformed :id URL param (e.g.
  // GET /evaluations/not-a-real-id). This is a routine client mistake, not
  // a server failure — return 400 with a clear message instead of letting
  // it fall through to the generic 500 branch below.
  if (err.name === "CastError") {
    return res.status(400).json({ success: false, message: `Invalid ${err.path || "id"} format` });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Token expired, please sign in again" });
  }

  // Only surface err.message to the client when the error was deliberately
  // thrown with a statusCode set (this app's own convention for intentional,
  // client-safe errors — see manage.service.js's createHttpError helper).
  // Anything without a statusCode is an unexpected failure (a library
  // internals error, an unhandled external-API failure, a bug) and should
  // not leak its raw message — e.g. driver/axios error text can incidentally
  // reveal internal hostnames or implementation details. Full detail is
  // still logged server-side via console.error above.
  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : "Internal server error";
  res.status(statusCode).json({ success: false, message });
};
