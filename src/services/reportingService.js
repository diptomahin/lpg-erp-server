import {
  CustomerPayment,
  Customer,
  CylinderType,
  Expense,
  Purchase,
  PurchaseBatch,
  Sale,
  SaleBatchAllocation,
  StockMovement,
  SupplierPayment,
  Supplier,
  SalaryPayment,
  ProfitSharePayment,
} from "../models/index.js";
import { round } from "../utils/numbers.js";
import { dateRange } from "../utils/dateRange.js";
const range = (field, from, to) => {
  const boundaries = dateRange(from, to);
  return Object.keys(boundaries).length ? { [field]: boundaries } : {};
};
const sum = (rows, field) =>
  round(
    rows.reduce((total, row) => total + Number(row[field] || 0), 0),
    2,
  );

const normalizePaymentMethod = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const cylinderBreakdown = (sales, cylinderTypes) => {
  const names = new Map(
    cylinderTypes.map((type) => [String(type._id), type.name]),
  );
  const totals = new Map();

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const key = String(item.cylinderType);
      const current = totals.get(key) || {
        name: names.get(key) || `${item.capacityKg || 0} KG cylinder`,
        quantity: 0,
        lpgKg: 0,
      };
      current.quantity += Number(item.cylinderCount || 0);
      current.lpgKg += Number(item.totalLpgKg || 0);
      totals.set(key, current);
    }
  }

  return [...totals.values()]
    .map((item) => ({
      ...item,
      quantity: round(item.quantity, 0),
      lpgKg: round(item.lpgKg, 3),
    }))
    .sort((left, right) => right.quantity - left.quantity);
};

export function summarizeCustomerReceipts(customerPayments = []) {
  const summary = customerPayments.reduce(
    (acc, payment) => {
      const amount = Number(payment?.amount || 0);
      if (payment?.paymentType === "advance_application") return acc;
      const method = normalizePaymentMethod(payment?.paymentMethod);
      if (method === "cash" || method === "") {
        acc.cash += amount;
      } else if (method === "banktransfer") {
        acc.bank += amount;
      } else {
        acc.cash += amount;
      }

      acc.total += amount;
      return acc;
    },
    { total: 0, cash: 0, bank: 0 },
  );

  return {
    total: round(summary.total, 2),
    cash: round(summary.cash, 2),
    bank: round(summary.bank, 2),
  };
}

export async function dailyReport({ from, to }) {
  const end = new Date(
    to
      ? new Date(new Date(to).getTime() + 86400000 - 1)
      : new Date(new Date(from || Date.now()).getTime() + 86400000 - 1),
  );
  const start = new Date(from || end.getTime() - 86400000);
  const [
    sales,
    purchases,
    customerPayments,
    supplierPayments,
    expenses,
    batches,
    customers,
    suppliers,
    salaryPayments,
    profitShares,
    cylinderTypes,
  ] = await Promise.all([
    Sale.find({ ...range("saleDate", start, end), status: "completed" }).lean(),
    Purchase.find({
      ...range("purchaseDate", start, end),
      status: "completed",
    }).lean(),
    CustomerPayment.find({
      ...range("paymentDate", start, end),
      status: "active",
    }).lean(),
    SupplierPayment.find({
      ...range("paymentDate", start, end),
      status: "active",
    }).lean(),
    Expense.find({
      ...range("expenseDate", start, end),
      status: "active",
    }).lean(),
    PurchaseBatch.find({ status: { $ne: "cancelled" } }).lean(),
    Customer.find({ status: "active" })
      .select("totalDue advanceBalance")
      .lean(),
    Supplier.find({ status: "active" })
      .select("totalDue advanceBalance")
      .lean(),
    SalaryPayment.find({ ...range("paymentDate", start, end) }).lean(),
    ProfitSharePayment.find({ ...range("paymentDate", start, end) }).lean(),
    CylinderType.find({ status: "active" }).select("name capacityKg").lean(),
  ]);
  const customerReceiptSummary = summarizeCustomerReceipts(customerPayments);
  const result = {
    totalSales: sum(sales, "totalAmount"),
    totalLpgSold: sum(sales, "totalLpgKg"),
    totalCylindersSold: sum(sales, "totalCylinderCount"),
    totalCustomerPayments: customerReceiptSummary.total,
    receivedInCash: customerReceiptSummary.cash,
    receivedInBank: customerReceiptSummary.bank,
    totalSupplierPayments: sum(
      supplierPayments.filter(
        (payment) => payment.paymentType !== "advance_application",
      ),
      "amount",
    ),
    totalExpenses: sum(expenses, "amount"),
    grossProfit: sum(sales, "grossProfit"),
    currentLpgStock: round(sum(batches, "remainingQuantityKg"), 3),
    totalSalaryPaid: sum(salaryPayments, "amount"),
    totalProfitSharePaid: sum(profitShares, "amount"),
    cylinderBreakdown: cylinderBreakdown(sales, cylinderTypes),
  };
  result.operatingProfit = round(
    result.grossProfit - result.totalExpenses - result.totalSalaryPaid,
    2,
  );
  result.customerDue = round(sum(customers, "totalDue"), 2);
  result.totalCustomerAdvances = round(sum(customers, "advanceBalance"), 2);
  result.supplierPayable = round(sum(suppliers, "totalDue"), 2);
  result.totalSupplierAdvances = round(sum(suppliers, "advanceBalance"), 2);
  return result;
}

export async function monthlyReport({ from, to }) {
  const [
    sales,
    purchases,
    expenses,
    customerPayments,
    supplierPayments,
    batches,
    customers,
    suppliers,
    salaryPayments,
    profitShares,
    cylinderTypes,
  ] = await Promise.all([
    Sale.find({ ...range("saleDate", from, to), status: "completed" }).lean(),
    Purchase.find({
      ...range("purchaseDate", from, to),
      status: "completed",
    }).lean(),
    Expense.find({
      ...range("expenseDate", from, to),
      status: "active",
    }).lean(),
    CustomerPayment.find({
      ...range("paymentDate", from, to),
      status: "active",
    }).lean(),
    SupplierPayment.find({
      ...range("paymentDate", from, to),
      status: "active",
    }).lean(),
    PurchaseBatch.find({ status: { $ne: "cancelled" } }).lean(),
    Customer.find({ status: "active" })
      .select("totalDue advanceBalance")
      .lean(),
    Supplier.find({ status: "active" })
      .select("totalDue advanceBalance")
      .lean(),
    SalaryPayment.find({ ...range("paymentDate", from, to) }).lean(),
    ProfitSharePayment.find({ ...range("paymentDate", from, to) }).lean(),
    CylinderType.find({ status: "active" }).select("name capacityKg").lean(),
  ]);
  const customerReceiptSummary = summarizeCustomerReceipts(customerPayments);
  const result = {
    totalLpgPurchased: sum(purchases, "quantityKg"),
    totalLpgSold: sum(sales, "totalLpgKg"),
    totalCylindersSold: sum(sales, "totalCylinderCount"),
    totalSalesRevenue: sum(sales, "totalAmount"),
    totalCogs: sum(sales, "totalCost"),
    grossProfit: sum(sales, "grossProfit"),
    totalExpenses: sum(expenses, "amount"),
    customerPayments: customerReceiptSummary.total,
    receivedInCash: customerReceiptSummary.cash,
    receivedInBank: customerReceiptSummary.bank,
    supplierPayments: sum(
      supplierPayments.filter(
        (payment) => payment.paymentType !== "advance_application",
      ),
      "amount",
    ),
    closingLpgStock: round(sum(batches, "remainingQuantityKg"), 3),
    customerOutstanding: sum(customers, "totalDue"),
    supplierOutstanding: sum(suppliers, "totalDue"),
    totalSalaryPaid: sum(salaryPayments, "amount"),
    totalProfitSharePaid: sum(profitShares, "amount"),
    cylinderBreakdown: cylinderBreakdown(sales, cylinderTypes),
  };
  result.operatingProfit = round(
    result.grossProfit - result.totalExpenses - result.totalSalaryPaid,
    2,
  );
  result.totalCustomerAdvances = round(sum(customers, "advanceBalance"), 2);
  result.totalSupplierAdvances = round(sum(suppliers, "advanceBalance"), 2);
  return result;
}

export async function batchProfit(query = {}) {
  const batches = await PurchaseBatch.find({
    ...range("batchDate", query.from, query.to),
  })
    .populate("purchase")
    .lean();
  const allocations = await SaleBatchAllocation.find({})
    .populate("sale")
    .lean();
  return batches.map((batch) => {
    const sold = allocations.filter(
      (item) =>
        String(item.batch) === String(batch._id) &&
        item.sale?.status === "completed",
    );
    const soldKg = sum(sold, "quantityKg");
    const revenue = sold.reduce(
      (total, item) =>
        total +
        (item.sale.items || []).reduce(
          (line, saleItem) =>
            total +
            saleItem.totalAmount * (item.quantityKg / item.sale.totalLpgKg),
          0,
        ),
      0,
    );
    const cogs = sum(sold, "totalCost");
    return {
      batchNumber: batch.batchNumber,
      originalQuantityKg: batch.originalQuantityKg,
      soldQuantityKg: soldKg,
      remainingQuantityKg: batch.remainingQuantityKg,
      purchaseCost: round(
        batch.originalQuantityKg * batch.acquisitionCostPerKg,
        2,
      ),
      revenueGenerated: round(revenue, 2),
      cogs,
      realizedGrossProfit: round(revenue - cogs, 2),
    };
  });
}
