import { ZodError } from "zod";
import { env } from "../config/env.js";
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status =
    err.status ||
    (err.name === "ValidationError" || err instanceof ZodError ? 400 : 500);
  const errors =
    err instanceof ZodError
      ? err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      : undefined;
  res.status(status).json({
    success: false,
    message:
      status === 500 && env.nodeEnv === "production"
        ? "Internal server error"
        : err.message || "Request failed",
    ...(errors ? { errors } : {}),
    ...(err.data ? { data: err.data } : {}),
  });
};
