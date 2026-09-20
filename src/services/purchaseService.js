import mongoose from "mongoose";
import {
  Purchase,
  PurchaseBatch,
  StockMovement,
  AuditLog,
  Supplier,
  SupplierPayment,
  SaleBatchAllocation,
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
      const totalCost = subtotal;
      const advancePayments = await SupplierPayment.find({
        supplier: input.supplier,
        paymentType: "advance",
        status: "active",
        remainingAmount: { $gt: 0 },
      })
        .sort({ paymentDate: 1, createdAt: 1 })
        .session(session);
      let remainingPurchaseBalance = round(
        Math.max(0, totalCost - input.totalPaid),
        2,
      );
      const advanceApplications = [];
      for (const advance of advancePayments) {
        if (!remainingPurchaseBalance) break;
        const applied = round(
          Math.min(
            Number(advance.remainingAmount || 0),
            remainingPurchaseBalance,
          ),
          2,
        );
        if (applied > 0) {
          advanceApplications.push({ advance, applied });
          remainingPurchaseBalance = round(
            remainingPurchaseBalance - applied,
            2,
          );
        }
      }
      const appliedAdvance = round(
        advanceApplications.reduce((total, item) => total + item.applied, 0),
        2,
      );
      const totalPaid = round(input.totalPaid + appliedAdvance, 2);
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
            estimatedQuantityKg: quantityKg,
            quantityStatus: "estimated",
            totalCost,
            totalPaid,
            totalDue: round(totalCost - totalPaid, 2),
            paymentStatus:
              totalPaid >= totalCost
                ? "paid"
                : totalPaid
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
            estimatedQuantityKg: quantityKg,
            quantityStatus: "estimated",
            purchaseCostPerKg: ratePerKg,
            acquisitionCostPerKg: ratePerKg,
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
              paymentType: "sale",
              paymentDate: purchase.purchaseDate,
              createdBy: user._id,
            },
          ],
          { session, ordered: true },
        );
      for (const { advance, applied } of advanceApplications) {
        advance.remainingAmount = round(
          Number(advance.remainingAmount || 0) - applied,
          2,
        );
        await advance.save({ session });
        await SupplierPayment.create(
          [
            {
              paymentNumber: number("SPAY"),
              supplier: input.supplier,
              purchase: purchase._id,
              amount: applied,
              paymentDate: purchase.purchaseDate,
              paymentMethod: advance.paymentMethod,
              paymentType: "advance_application",
              createdBy: user._id,
            },
          ],
          { session, ordered: true },
        );
      }
      const remainingAdvanceRows = await SupplierPayment.aggregate([
        {
          $match: {
            supplier: input.supplier,
            paymentType: "advance",
            status: "active",
            remainingAmount: { $gt: 0 },
          },
        },
        { $group: { _id: null, amount: { $sum: "$remainingAmount" } } },
      ]).session(session);
      await Supplier.updateOne(
        { _id: input.supplier },
        {
          $inc: {
            existingPayable: round(totalCost - totalPaid, 2),
            totalDue: round(totalCost - totalPaid, 2),
          },
          $set: {
            advanceBalance: Number(remainingAdvanceRows[0]?.amount || 0),
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

export async function confirmPurchaseQuantity(id, actualQuantityKg, user) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const purchase = await Purchase.findOne({
        _id: id,
        status: "completed",
      }).session(session);
      if (!purchase) {
        const error = new Error("Completed purchase not found");
        error.status = 404;
        throw error;
      }
      const batch = await PurchaseBatch.findOne({ purchase: id }).session(
        session,
      );
      if (!batch || batch.status === "cancelled") {
        const error = new Error("Purchase batch not found");
        error.status = 404;
        throw error;
      }
      const sold = await SaleBatchAllocation.aggregate([
        { $match: { batch: batch._id } },
        { $group: { _id: null, quantityKg: { $sum: "$quantityKg" } } },
      ]).session(session);
      const soldQuantityKg = round(Number(sold[0]?.quantityKg || 0), 3);
      if (actualQuantityKg < soldQuantityKg) {
        const error = new Error(
          `Actual quantity cannot be below sold quantity (${soldQuantityKg} KG)`,
        );
        error.status = 409;
        throw error;
      }

      const oldQuantityKg = Number(
        purchase.quantityKg || batch.originalQuantityKg || 0,
      );
      const oldTotalCost = Number(purchase.totalCost || 0);
      const newTotalCost = round(
        actualQuantityKg * Number(purchase.purchaseRatePerKg || 0),
        2,
      );
      const oldTotalDue = Number(purchase.totalDue || 0);
      const newTotalDue = round(
        Math.max(0, newTotalCost - Number(purchase.totalPaid || 0)),
        2,
      );
      purchase.quantityKg = actualQuantityKg;
      purchase.quantityTon = round(actualQuantityKg / 1000, 3);
      purchase.actualQuantityKg = actualQuantityKg;
      purchase.quantityStatus = "confirmed";
      purchase.subtotal = newTotalCost;
      purchase.totalCost = newTotalCost;
      purchase.totalDue = newTotalDue;
      purchase.paymentStatus = newTotalDue === 0 ? "paid" : "partial";
      await purchase.save({ session });

      batch.actualQuantityKg = actualQuantityKg;
      batch.quantityStatus = "confirmed";
      batch.originalQuantityKg = actualQuantityKg;
      batch.remainingQuantityKg = round(actualQuantityKg - soldQuantityKg, 3);
      batch.status = batch.remainingQuantityKg ? "available" : "exhausted";
      batch.acquisitionCostPerKg = Number(purchase.purchaseRatePerKg || 0);
      await batch.save({ session });

      const payableDelta = round(newTotalDue - oldTotalDue, 2);
      if (payableDelta) {
        await Supplier.updateOne(
          { _id: purchase.supplier },
          {
            $inc: {
              existingPayable: payableDelta,
              totalDue: payableDelta,
            },
          },
          { session },
        );
      }
      const stockDelta = round(actualQuantityKg - oldQuantityKg, 3);
      if (stockDelta) {
        await StockMovement.create(
          [
            {
              movementNumber: number("MOV"),
              type: "CORRECTION",
              quantityKg: stockDelta,
              batch: batch._id,
              referenceType: "Purchase",
              referenceId: purchase._id,
              date: new Date(),
              notes: "Purchase quantity confirmed",
              createdBy: user._id,
            },
          ],
          { session, ordered: true },
        );
      }
      await AuditLog.create(
        [
          {
            user: user._id,
            action: "UPDATE",
            entityType: "Purchase",
            entityId: purchase._id,
            oldData: {
              quantityKg: oldQuantityKg,
              totalCost: oldTotalCost,
            },
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
