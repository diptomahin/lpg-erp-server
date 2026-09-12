import app from "../src/app.js";
import { connectDb } from "../src/config/db.js";

let dbConnectionPromise = null;

export default async function handler(req, res) {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDb();
  }

  try {
    await dbConnectionPromise;
    return app(req, res);
  } catch (error) {
    console.error("Database connection failed for Vercel request", error);
    return res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
}
