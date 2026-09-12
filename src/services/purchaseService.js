import mongoose from "mongoose";
import {
  Purchase,
  PurchaseBatch,
  StockMovement,
  AuditLog,
  Supplier,
  SupplierPayment,
} from "../models/index.js";
import { tonToKg, round } from "../utils/numbers.js";
const number = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

export async function createPurchase(input, user) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const supplier = await Supplier.findById(input.supplier).session(session);
      if (!supplier) {
        const e = new Error("Supplier not found");
        e.status = 404;
        throw e;
      }
      const quantityKg = input.quantityKg ?? tonToKg(input.quantityTon);
      const quantityTon = input.quantityTon ?? round(quantityKg / 1000, 3);
      const ratePerKg = input.purchaseRatePerKg;
      const ratePerTon = round(ratePerKg * 1000, 2);
      const subtotal = round(quantityKg * ratePerKg, 2);
      const totalCost = round(subtotal + input.additionalCost, 2);
      const [purchase] = await Purchase.create(
        [
          {
            purchaseNumber: number("PUR"),
            supplier: input.supplier,
            purchaseDate: input.purchaseDate || new Date(),
            quantityTon,
            quantityKg,
            purchaseRatePerTon: ratePerTon,
            purchaseRatePerKg: ratePerKg,
            subtotal,
            additionalCost: input.additionalCost,
            totalCost,
            totalPaid: input.totalPaid,
            totalDue: round(totalCost - input.totalPaid, 2),
            paymentStatus:
              input.totalPaid >= totalCost
                ? "paid"
                : input.totalPaid
                  ? "partial"
                  : "unpaid",
            notes: input.notes,
            createdBy: user._id,
          },
        ],
        { session, ordered: true },
      );
      const [batch] = await PurchaseBatch.create(
        [
          {
            batchNumber: number("BAT"),
            purchase: purchase._id,
            supplier: input.supplier,
            batchDate: purchase.purchaseDate,
            originalQuantityKg: quantityKg,
            remainingQuantityKg: quantityKg,
            purchaseCostPerKg: ratePerKg,
            additionalCost: input.additionalCost,
            acquisitionCostPerKg: round(totalCost / quantityKg, 4),
          },
        ],
        { session, ordered: true },
      );
      if (input.totalPaid > 0)
        await SupplierPayment.create(
          [
            {
              paymentNumber: number("SPAY"),
              supplier: input.supplier,
              purchase: purchase._id,
              amount: input.totalPaid,
              paymentDate: purchase.purchaseDate,
              createdBy: user._id,
            },
          ],
          { session, ordered: true },
        );
      await Supplier.updateOne(
        { _id: input.supplier },
        {
          $inc: {
            existingPayable: round(totalCost - input.totalPaid, 2),
            totalDue: round(totalCost - input.totalPaid, 2),
          },
        },
        { session },
      );
      if (input.totalPaid > totalCost) {
        const e = new Error("Initial payment exceeds purchase total");
        e.status = 400;
        throw e;
      }
      await StockMovement.create(
        [
          {
            movementNumber: number("MOV"),
            type: "PURCHASE",
            quantityKg,
            batch: batch._id,
            referenceType: "Purchase",
            referenceId: purchase._id,
            date: purchase.purchaseDate,
            createdBy: user._id,
          },
        ],
        { session, ordered: true },
      );
      await AuditLog.create(
        [
          {
            user: user._id,
            action: "CREATE",
            entityType: "Purchase",
            entityId: purchase._id,
            newData: purchase.toObject(),
          },
        ],
        { session, ordered: true },
      );
      result = purchase;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function voidPurchase(id, user) {
  const session = await mongoose.startSession();
  try {
    let purchase;
    await session.withTransaction(async () => {
      purchase = await Purchase.findOne({
        _id: id,
        status: "completed",
      }).session(session);
      if (!purchase) {
        const error = new Error("Completed purchase not found");
        error.status = 404;
        throw error;
      }
      const batches = await PurchaseBatch.find({ purchase: id }).session(
        session,
      );
      if (
        batches.some(
          (batch) => batch.remainingQuantityKg !== batch.originalQuantityKg,
        )
      ) {
        const error = new Error(
          "Purchase cannot be voided after its batch has been consumed",
        );
        error.status = 409;
        throw error;
      }
      for (const batch of batches) {
        batch.status = "cancelled";
        batch.remainingQuantityKg = 0;
        await batch.save({ session });
        await StockMovement.create(
          [
            {
              movementNumber: number("MOV"),
              type: "CORRECTION",
              quantityKg: -batch.originalQuantityKg,
              batch: batch._id,
              referenceType: "Purchase",
              referenceId: purchase._id,
              notes: "Purchase void",
              createdBy: user._id,
            },
          ],
          { session, ordered: true },
        );
      }
      purchase.status = "void";
      await purchase.save({ session });
      const activePayments = await SupplierPayment.find({
        purchase: purchase._id,
        status: "active",
      })
        .select("amount")
        .session(session)
        .lean();
      await Supplier.updateOne(
        { _id: purchase.supplier },
        {
          $inc: {
            existingPayable: -round(
              purchase.totalCost -
                activePayments.reduce(
                  (sum, payment) => sum + payment.amount,
                  0,
                ),
              2,
            ),
            totalDue: -round(
              purchase.totalCost -
                activePayments.reduce(
                  (sum, payment) => sum + payment.amount,
                  0,
                ),
              2,
            ),
          },
        },
        { session },
      );
      await SupplierPayment.updateMany(
        { purchase: purchase._id, status: "active" },
        { $set: { status: "void" } },
        { session },
      );
      await AuditLog.create(
        [
          {
            user: user._id,
            action: "VOID",
            entityType: "Purchase",
            entityId: purchase._id,
            newData: purchase.toObject(),
          },
        ],
        { session, ordered: true },
      );
    });
    return purchase;
  } finally {
    await session.endSession();
  }
}
