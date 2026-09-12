import bcrypt from "bcryptjs";
import { connectDb } from "./config/db.js";
import { User, CylinderType, ExpenseCategory } from "./models/index.js";
await connectDb();
await User.updateOne(
  { email: "admin@example.com" },
  {
    $set: {
      name: "Administrator",
      password: await bcrypt.hash("ChangeMe123!", 12),
      role: "admin",
      status: "active",
    },
  },
  { upsert: true },
);
await CylinderType.bulkWrite(
  [12, 30, 35, 45].map((capacityKg) => ({
    updateOne: {
      filter: { name: `${capacityKg} KG` },
      update: { $set: { capacityKg, status: "active" } },
      upsert: true,
    },
  })),
);
await ExpenseCategory.bulkWrite(
  [
    "SALARY",
    "TRANSPORT",
    "SHIPPING",
    "ELECTRICITY",
    "FUEL",
    "MAINTENANCE",
    "OFFICE",
    "OTHER",
  ].map((name) => ({
    updateOne: {
      filter: { name },
      update: { $set: { status: "active" } },
      upsert: true,
    },
  })),
);
console.log("Seed complete. Change the seeded admin password immediately.");
process.exit(0);
