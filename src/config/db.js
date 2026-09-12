import mongoose from "mongoose";
import { env } from "./env.js";

export const connectDb = () =>
  mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
