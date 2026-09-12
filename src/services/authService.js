import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { env } from "../config/env.js";
export async function login(email, password) {
  const user = await User.findOne({ email }).select("+password");
  if (
    !user ||
    user.status !== "active" ||
    !(await bcrypt.compare(password, user.password))
  ) {
    const e = new Error("Invalid credentials");
    e.status = 401;
    throw e;
  }
  const token = jwt.sign({ id: user._id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
  return {
    token,
    user: user.toObject({
      transform: (_, value) => {
        delete value.password;
        return value;
      },
    }),
  };
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select("+password");
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    const e = new Error("Current password is incorrect");
    e.status = 400;
    throw e;
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    const e = new Error("New password must be at least 8 characters");
    e.status = 400;
    throw e;
  }
  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
}
