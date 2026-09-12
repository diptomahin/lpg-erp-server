import mongoose from "mongoose";
import { AuditLog, PurchaseBatch, StockMovement } from "../models/index.js";
import { round } from "../utils/numbers.js";
const number = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

export async function adjustStock(
  { type, quantityKg, batch, reason, notes },
  user,
) {
  const session = await mongoose.startSession();
  try {
    let movement;
    await session.withTransaction(async () => {
      const purchaseBatch =
        await PurchaseBatch.findById(batch).session(session);
      if (!purchaseBatch || purchaseBatch.status === "cancelled") {
        const error = new Error("Available batch not found");
        error.status = 404;
        throw error;
      }
      const signedQuantity =
        type === "ADJUSTMENT_IN" ? quantityKg : -quantityKg;
      if (purchaseBatch.remainingQuantityKg + signedQuantity < 0) {
        const error = new Error(
          "Stock adjustment exceeds available batch quantity",
        );
        error.status = 400;
        throw error;
      }
      purchaseBatch.remainingQuantityKg = round(
        purchaseBatch.remainingQuantityKg + signedQuantity,
        3,
      );
      purchaseBatch.status = purchaseBatch.remainingQuantityKg
        ? "available"
        : "exhausted";
      await purchaseBatch.save({ session });
      [movement] = await StockMovement.create(
        [
          {
            movementNumber: number("MOV"),
            type,
            quantityKg: signedQuantity,
            batch,
            referenceType: "StockAdjustment",
            date: new Date(),
            notes: `${reason}${notes ? `: ${notes}` : ""}`,
            createdBy: user._id,
          },
        ],
        { session, ordered: true },
      );
      await AuditLog.create(
        [
          {
            user: user._id,
            action: "STOCK_ADJUSTMENT",
            entityType: "StockMovement",
            entityId: movement._id,
            newData: movement.toObject(),
          },
        ],
        { session, ordered: true },
      );
    });
    return movement;
  } finally {
    await session.endSession();
  }
}
