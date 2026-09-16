import mongoose from "mongoose";
import {
  CustomerPayment,
  SupplierPayment,
  Sale,
  Purchase,
  Customer,
  Supplier,
  AuditLog,
} from "../models/index.js";
const number = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
export async function createPayment(kind, input, user) {
  const session = await mongoose.startSession();
  try {
    let payment;
    await session.withTransaction(async () => {
      const Model = kind === "customer" ? CustomerPayment : SupplierPayment;
      const Transaction = kind === "customer" ? Sale : Purchase;
      const transactionKey = kind === "customer" ? "sale" : "purchase";
      const partyKey = kind;
      if (!input[partyKey]) {
        const transaction =
          input[kind === "customer" ? "sale" : "purchase"] &&
          (await Transaction.findById(
            input[kind === "customer" ? "sale" : "purchase"],
          ).session(session));
        input[partyKey] = transaction?.[partyKey];
      }
      if (input.paymentType === "advance") {
        if (input.sale) {
          const e = new Error(
            "Advance payments cannot be linked to a transaction",
          );
          e.status = 400;
          throw e;
        }
        if (input.purchase) {
          const e = new Error(
            "Advance payments cannot be linked to a transaction",
          );
          e.status = 400;
          throw e;
        }
        const Party = kind === "customer" ? Customer : Supplier;
        const party = await Party.findById(input[partyKey])
          .select("totalDue")
          .session(session);
        if (!party) {
          const e = new Error(
            `${kind === "customer" ? "Customer" : "Supplier"} not found`,
          );
          e.status = 404;
          throw e;
        }
        if (Number(party.totalDue || 0) > 0) {
          const e = new Error(
            `${kind === "customer" ? "Customer" : "Supplier"} must have no outstanding balance before making an advance payment`,
          );
          e.status = 400;
          throw e;
        }
        [payment] = await Model.create(
          [
            {
              ...input,
              paymentType: "advance",
              remainingAmount: input.amount,
              paymentNumber: number(kind === "customer" ? "CPAY" : "SPAY"),
              createdBy: user._id,
            },
          ],
          { session, ordered: true },
        );
        await Party.updateOne(
          { _id: input[partyKey] },
          { $inc: { advanceBalance: input.amount } },
          { session },
        );
        await AuditLog.create(
          [
            {
              user: user._id,
              action: "ADVANCE_PAYMENT",
              entityType: Model.modelName,
              entityId: payment._id,
              newData: payment.toObject(),
            },
          ],
          { session, ordered: true },
        );
        return;
      }
      if (input[transactionKey]) {
        const transaction = await Transaction.findById(
          input[transactionKey],
        ).session(session);
        const due = transaction
          ? (transaction.totalAmount ?? transaction.totalCost) -
            transaction.totalPaid
          : 0;
        if (!transaction || transaction.status === "void") {
          const e = new Error("Linked transaction not found or void");
          e.status = 400;
          throw e;
        }
        if (input.amount > due) {
          const e = new Error("Payment exceeds outstanding balance");
          e.status = 400;
          throw e;
        }
      }
      if (!input[partyKey]) {
        const e = new Error(`${kind} is required for a general payment`);
        e.status = 400;
        throw e;
      }
      const Party = kind === "customer" ? Customer : Supplier;
      const balanceField =
        kind === "customer" ? "existingReceivable" : "existingPayable";
      const party = await Party.findById(input[partyKey])
        .select("totalDue")
        .session(session);
      if (!party) {
        const e = new Error(`${kind} not found`);
        e.status = 404;
        throw e;
      }
      if (input.amount > Number(party.totalDue || 0)) {
        const e = new Error(
          `Payment exceeds outstanding ${kind === "customer" ? "receivable" : "payable"}`,
        );
        e.status = 400;
        throw e;
      }
      await Party.updateOne(
        { _id: input[partyKey] },
        {
          $inc: {
            [balanceField]: -input.amount,
            totalDue: -input.amount,
          },
        },
        { session },
      );
      [payment] = await Model.create(
        [
          {
            ...input,
            paymentType: input.paymentType || "sale",
            remainingAmount: 0,
            paymentNumber: number(kind === "customer" ? "CPAY" : "SPAY"),
            createdBy: user._id,
          },
        ],
        { session, ordered: true },
      );
      await AuditLog.create(
        [
          {
            user: user._id,
            action: "PAYMENT",
            entityType: Model.modelName,
            entityId: payment._id,
            newData: payment.toObject(),
          },
        ],
        { session, ordered: true },
      );
      if (input[transactionKey]) {
        const transaction = await Transaction.findById(
          input[transactionKey],
        ).session(session);
        if (transaction) {
          transaction.totalPaid += input.amount;
          const total = transaction.totalAmount ?? transaction.totalCost;
          transaction.totalDue = Math.max(0, total - transaction.totalPaid);
          transaction.paymentStatus =
            transaction.totalDue === 0 ? "paid" : "partial";
          await transaction.save({ session });
        }
      }
    });
    return payment;
  } finally {
    await session.endSession();
  }
}
