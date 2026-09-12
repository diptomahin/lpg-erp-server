import mongoose from "mongoose";
import {
  Sale,
  CylinderType,
  Customer,
  SaleBatchAllocation,
  StockMovement,
  AuditLog,
  CustomerPayment,
} from "../models/index.js";
import { allocateFifo } from "./fifoService.js";
import { round } from "../utils/numbers.js";
const number = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

export async function createSale(input, user) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      if (!(await Customer.exists({ _id: input.customer }).session(session))) {
        const e = new Error("Customer not found");
        e.status = 404;
        throw e;
      }
      const types = await CylinderType.find({
        _id: { $in: input.items.map((item) => item.cylinderType) },
        status: "active",
      }).session(session);
      const byId = new Map(types.map((type) => [String(type._id), type]));
      const items = input.items.map((item) => {
        const type = byId.get(String(item.cylinderType));
        if (!type) {
          const e = new Error("Cylinder type not found or inactive");
          e.status = 400;
          throw e;
        }
        const totalLpgKg = round(type.capacityKg * item.cylinderCount, 3);
        const ratePerKg = round(item.pricePerCylinder / type.capacityKg, 4);
        return {
          cylinderType: type._id,
          capacityKg: type.capacityKg,
          cylinderCount: item.cylinderCount,
          totalLpgKg,
          pricePerCylinder: item.pricePerCylinder,
          ratePerKg,
          totalAmount: round(item.pricePerCylinder * item.cylinderCount, 2),
        };
      });
      const totalLpgKg = round(
        items.reduce((sum, item) => sum + item.totalLpgKg, 0),
        3,
      );
      const subtotal = round(
        items.reduce((sum, item) => sum + item.totalAmount, 0),
        2,
      );
      const totalAmount = round(subtotal - input.discount, 2);
      const fifo = await allocateFifo(totalLpgKg, session);
      if (fifo.insufficient) {
        const e = new Error("Insufficient LPG inventory");
        e.status = 400;
        e.data = {
          requiredKg: totalLpgKg,
          availableKg: fifo.availableKg,
          shortageKg: fifo.shortageKg,
        };
        throw e;
      }
      const [sale] = await Sale.create(
        [
          {
            invoiceNumber: number("INV"),
            customer: input.customer,
            saleDate: input.saleDate || new Date(),
            items,
            totalCylinderCount: items.reduce(
              (sum, item) => sum + item.cylinderCount,
              0,
            ),
            totalLpgKg,
            subtotal,
            discount: input.discount,
            totalAmount,
            totalCost: fifo.totalCost,
            grossProfit: round(totalAmount - fifo.totalCost, 2),
            totalPaid: input.totalPaid,
            totalDue: round(totalAmount - input.totalPaid, 2),
            paymentStatus:
              input.totalPaid >= totalAmount
                ? "paid"
                : input.totalPaid
                  ? "partial"
                  : "unpaid",
            createdBy: user._id,
          },
        ],
        { session, ordered: true },
      );
      await SaleBatchAllocation.insertMany(
        fifo.allocations.map((a) => ({
          sale: sale._id,
          batch: a.batch._id,
          quantityKg: a.quantityKg,
          costPerKg: a.costPerKg,
          totalCost: a.totalCost,
        })),
        { session },
      );
      if (input.totalPaid > 0)
        await CustomerPayment.create(
          [
            {
              paymentNumber: number("CPAY"),
              customer: input.customer,
              sale: sale._id,
              amount: input.totalPaid,
              paymentDate: sale.saleDate,
              createdBy: user._id,
            },
          ],
          { session, ordered: true },
        );
      await Customer.updateOne(
        { _id: input.customer },
        {
          $inc: {
            existingReceivable: round(totalAmount - input.totalPaid, 2),
            totalDue: round(totalAmount - input.totalPaid, 2),
          },
        },
        { session },
      );
      if (input.discount > subtotal) {
        const e = new Error("Discount exceeds sale subtotal");
        e.status = 400;
        throw e;
      }
      if (input.totalPaid > totalAmount) {
        const e = new Error("Initial payment exceeds sale total");
        e.status = 400;
        throw e;
      }
      await StockMovement.create(
        fifo.allocations.map((a) => ({
          movementNumber: number("MOV"),
          type: "SALE",
          quantityKg: -a.quantityKg,
          batch: a.batch._id,
          referenceType: "Sale",
          referenceId: sale._id,
          date: sale.saleDate,
          createdBy: user._id,
        })),
        { session, ordered: true },
      );
      await AuditLog.create(
        [
          {
            user: user._id,
            action: "CREATE",
            entityType: "Sale",
            entityId: sale._id,
            newData: sale.toObject(),
          },
        ],
        { session, ordered: true },
      );
      result = sale;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function voidSale(id, user) {
  const session = await mongoose.startSession();
  let sale;
  try {
    await session.withTransaction(async () => {
      sale = await Sale.findOne({ _id: id, status: "completed" }).session(
        session,
      );
      if (!sale) {
        const e = new Error("Completed sale not found");
        e.status = 404;
        throw e;
      }
      const allocations = await SaleBatchAllocation.find({ sale: id }).session(
        session,
      );
      for (const allocation of allocations) {
        const batch = await mongoose
          .model("PurchaseBatch")
          .findById(allocation.batch)
          .session(session);
        if (batch) {
          batch.remainingQuantityKg = round(
            batch.remainingQuantityKg + allocation.quantityKg,
            3,
          );
          batch.status = "available";
          await batch.save({ session });
        }
      }
      sale.status = "void";
      await sale.save({ session });
      const activePayments = await CustomerPayment.find({
        sale: sale._id,
        status: "active",
      })
        .select("amount")
        .session(session)
        .lean();
      await Customer.updateOne(
        { _id: sale.customer },
        {
          $inc: {
            existingReceivable: -round(
              sale.totalAmount -
                activePayments.reduce(
                  (sum, payment) => sum + payment.amount,
                  0,
                ),
              2,
            ),
            totalDue: -round(
              sale.totalAmount -
                activePayments.reduce(
                  (sum, payment) => sum + payment.amount,
                  0,
                ),
              2,
            ),
          },
        },
        { session, ordered: true },
      );
      await CustomerPayment.updateMany(
        { sale: sale._id, status: "active" },
        { $set: { status: "void" } },
        { session },
      );
      await StockMovement.create(
        allocations.map((a) => ({
          movementNumber: number("MOV"),
          type: "RETURN",
          quantityKg: a.quantityKg,
          batch: a.batch,
          referenceType: "Sale",
          referenceId: sale._id,
          createdBy: user._id,
        })),
        { session },
      );
      await AuditLog.create(
        [
          {
            user: user._id,
            action: "VOID",
            entityType: "Sale",
            entityId: sale._id,
            newData: sale.toObject(),
          },
        ],
        { session, ordered: true },
      );
    });
    return sale;
  } finally {
    await session.endSession();
  }
}
