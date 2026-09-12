import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import api from "./routes/api.js";
import { errorHandler } from "./middleware/error.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { env } from "./config/env.js";

const buildOriginMatcher = (originPattern) => {
  const escaped = originPattern
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`);
};

export const resolveCorsOrigin = (originConfig = env.clientOrigin) => {
  if (!originConfig || originConfig === "*") {
    return true;
  }

  const allowedOrigins = originConfig
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
    return true;
  }

  return (requestOrigin, callback) => {
    if (!requestOrigin) {
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some((allowedOrigin) => {
      if (allowedOrigin === requestOrigin) {
        return true;
      }

      return buildOriginMatcher(allowedOrigin).test(requestOrigin);
    });

    if (!isAllowed) {
      return callback(new Error("Origin not allowed by CORS policy"), false);
    }

    callback(null, true);
  };
};

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: resolveCorsOrigin(env.clientOrigin),
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));
app.use(rateLimit());
app.get("/health", (req, res) =>
  res.json({ success: true, message: "OK", data: { service: "lpg-erp" } }),
);
app.use("/api", api);
app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);
app.use(errorHandler);
export default app;
