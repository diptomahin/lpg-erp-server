import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { env } from "../config/env.js";
import { fail, asyncHandler } from "../utils/api.js";
export const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return fail(res, "Authentication required", [], 401);
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = await User.findById(payload.id);
    if (!req.user || req.user.status !== "active")
      return fail(res, "Account is inactive", [], 401);
    next();
  } catch {
    return fail(res, "Invalid or expired token", [], 401);
  }
});
export const authorize =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role) ? next() : fail(res, "Forbidden", [], 403);
