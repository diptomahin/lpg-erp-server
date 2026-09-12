import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import api from "./routes/api.js";
import { errorHandler } from "./middleware/error.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { env } from "./config/env.js";
const app = express();
app.use(helmet());
app.use(cors({ origin: env.clientOrigin === "*" ? true : env.clientOrigin }));
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
