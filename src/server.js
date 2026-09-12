import { pathToFileURL } from "node:url";
import app from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
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
}

export default app;
