const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const env = require("./config/env");
const AppError = require("./utils/appError");
const { sendSuccess } = require("./utils/apiResponse");
const apiRoutes = require("./routes/api.routes");
const notFound = require("./middlewares/notFound.middleware");
const globalErrorHandler = require("./middlewares/errorHandler.middleware");

const app = express();

app.set("trust proxy", env.trustProxy);
app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, "");
    if (
      env.corsOrigins.includes("*") ||
      env.corsOrigins.includes(normalized) ||
      (normalized.includes("sslip.io") && env.corsOrigins.some((o) => o.includes("sslip.io"))) ||
      normalized.includes("arunafeltzcomputerpos.cloud")
    ) {
      return callback(null, true);
    }
    return callback(new AppError("Request origin is not allowed", 403, "CORS_ORIGIN_DENIED"));
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

app.get("/", (req, res) => {
  return sendSuccess(res, {
    message: "Pointify Backend API is running",
    data: {
      service: "pointify-backend",
      status: "online",
      version: "1.0.2",
    },
  });
});

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode === 403 && body && typeof body === "object") {
      const currentMsg =
        body.message ||
        body.error?.message ||
        (typeof body.error === "string" ? body.error : "");
      let restrictedMsg;
      if (!currentMsg || currentMsg.toLowerCase() === "forbidden") {
        restrictedMsg = "Account restricted: You do not have permission to perform this action.";
      } else if (currentMsg.toLowerCase().startsWith("account restricted")) {
        restrictedMsg = currentMsg;
      } else {
        restrictedMsg = `Account restricted: ${currentMsg}`;
      }

      body.message = restrictedMsg;
      if (body.error && typeof body.error === "object") {
        body.error.message = restrictedMsg;
        if (!body.error.code || body.error.code === "FORBIDDEN" || body.error.code === "INTERNAL_SERVER_ERROR") {
          body.error.code = "ACCOUNT_RESTRICTED";
        }
      } else if (typeof body.error === "string") {
        body.error = restrictedMsg;
      }
      if (!body.errorCode || body.errorCode === "FORBIDDEN") {
        body.errorCode = body.errorCode || "ACCOUNT_RESTRICTED";
      }
    }
    return originalJson(body);
  };
  next();
});

app.use("/api", apiRoutes);

app.use(notFound);
app.use(globalErrorHandler);

module.exports = app;
