const env = require("../config/env");
const logger = require("../utils/logger");

const globalErrorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    logger.error("Server error response", {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error.message,
      stack: error.stack,
    });
  } else {
    logger.warn("Client error response", {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      code: error.code,
      message: error.message,
    });
  }

  let errorCode = error.code || "INTERNAL_SERVER_ERROR";
  let errorMessage = error.message || "Something went wrong. Please try again later.";

  if (statusCode === 403) {
    if (!errorMessage || errorMessage.toLowerCase() === "forbidden") {
      errorMessage = "Account restricted: You do not have permission to perform this action.";
    } else if (!errorMessage.toLowerCase().startsWith("account restricted")) {
      errorMessage = `Account restricted: ${errorMessage}`;
    }
    if (errorCode === "FORBIDDEN" || errorCode === "INTERNAL_SERVER_ERROR") {
      errorCode = "ACCOUNT_RESTRICTED";
    }
  }

  const response = {
    success: false,
    message: errorMessage,
    errorCode,
    error: {
      code: errorCode,
      message: errorMessage,
    },
  };

  if (env.nodeEnv === "development") {
    response.error.details = {
      name: error.name,
      stack: error.stack,
    };
  }

  return res.status(statusCode).json(response);
};

module.exports = globalErrorHandler;
