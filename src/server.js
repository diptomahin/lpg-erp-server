import app from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
connectDb()
  .then(() =>
    app.listen(env.port, () =>
      console.log(`LPG API listening on port ${env.port}`),
    ),
  )
  .catch((error) => {
    console.error("Database connection failed", error);
    process.exit(1);
  });
