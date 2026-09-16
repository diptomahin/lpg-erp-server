import {
  Customer,
  CustomerPayment,
  Sale,
  Supplier,
  SupplierPayment,
  Purchase,
} from "../models/index.js";
import { round } from "../utils/numbers.js";

const dateFilter = (field, query) => ({
  ...(query.from || query.to
    ? {
        [field]: {
          ...(query.from ? { $gte: new Date(query.from) } : {}),
          ...(query.to ? { $lte: new Date(query.to) } : {}),
        },
      }
    : {}),
});

export async function customerLedger(customerId, query = {}) {
  const customer = await Customer.findById(customerId)
    .select("+migrationReceivable existingReceivable")
    .lean();
  if (!customer) return null;
  const [sales, payments] = await Promise.all([
    Sale.find({
      customer: customerId,
      status: "completed",
      ...dateFilter("saleDate", query),
    }).lean(),
    CustomerPayment.find({
      customer: customerId,
      status: "active",
      $or: [{ paymentType: "sale" }, { paymentType: { $exists: false } }],
      ...dateFilter("paymentDate", query),
    }).lean(),
  ]);
  const entries = [
    ...sales.map((sale) => ({
      date: sale.saleDate,
      description: "Sale",
      reference: sale.invoiceNumber,
      debit: sale.totalAmount,
      credit: 0,
      source: sale,
    })),
    ...payments.map((payment) => ({
      date: payment.paymentDate,
      description: "Customer payment",
      reference: payment.paymentNumber,
      debit: 0,
      credit: payment.amount,
      source: payment,
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  let balance = Number(
    customer.migrationReceivable ??
      customer.existingReceivable ??
      customer.openingBalance ??
      0,
  );
  return entries.map((entry) => ({
    ...entry,
    balance: round((balance += entry.debit - entry.credit), 2),
  }));
}

export async function supplierLedger(supplierId, query = {}) {
  const supplier = await Supplier.findById(supplierId)
    .select("+migrationPayable existingPayable")
    .lean();
  if (!supplier) return null;
  const [purchases, payments] = await Promise.all([
    Purchase.find({
      supplier: supplierId,
      status: "completed",
      ...dateFilter("purchaseDate", query),
    }).lean(),
    SupplierPayment.find({
      supplier: supplierId,
      status: "active",
      $or: [{ paymentType: "sale" }, { paymentType: { $exists: false } }],
      ...dateFilter("paymentDate", query),
    }).lean(),
  ]);
  const entries = [
    ...purchases.map((purchase) => ({
      date: purchase.purchaseDate,
      description: "Purchase",
      reference: purchase.purchaseNumber,
      debit: purchase.totalCost,
      credit: 0,
      source: purchase,
    })),
    ...payments.map((payment) => ({
      date: payment.paymentDate,
      description: "Supplier payment",
      reference: payment.paymentNumber,
      debit: 0,
      credit: payment.amount,
      source: payment,
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  let balance = Number(
    supplier.migrationPayable ??
      supplier.existingPayable ??
      supplier.openingBalance ??
      0,
  );
  return entries.map((entry) => ({
    ...entry,
    balance: round((balance += entry.debit - entry.credit), 2),
  }));
}

export async function partyBalance(
  Model,
  Transaction,
  Payment,
  id,
  transactionKey,
) {
  const party = await Model.findById(id).lean();
  if (!party) return null;
  const [transactions, payments] = await Promise.all([
    Transaction.find({ [transactionKey]: id, status: "completed" })
      .select("totalAmount totalCost")
      .lean(),
    Payment.find({ [transactionKey]: id, status: "active" })
      .select("amount")
      .lean(),
  ]);
  const charges = transactions.reduce(
    (sum, item) => sum + (item.totalAmount ?? item.totalCost ?? 0),
    0,
  );
  const paid = payments.reduce((sum, item) => sum + item.amount, 0);
  if (party.totalDue !== undefined) return round(party.totalDue, 2);
  const existingBalance =
    transactionKey === "customer"
      ? (party.existingReceivable ?? party.openingBalance ?? 0)
      : (party.existingPayable ?? party.openingBalance ?? 0);
  return round(existingBalance + charges - paid, 2);
}
