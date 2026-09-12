import {
  CustomerPayment,
  Customer,
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

const range = (field, from, to) => {
  const end = to ? new Date(to) : null;
  if (end) end.setHours(23, 59, 59, 999);
  return {
    ...(from || to
      ? {
          [field]: {
            ...(from ? { $gte: new Date(from) } : {}),
            ...(end ? { $lte: end } : {}),
          },
        }
      : {}),
  };
};
const sum = (rows, field) =>
  round(
    rows.reduce((total, row) => total + Number(row[field] || 0), 0),
    2,
  );

export async function dailyReport({ from, to }) {
  const end = new Date(
    to || new Date(new Date(from || Date.now()).getTime() + 86400000),
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
    Customer.find({ status: "active" }).select("totalDue").lean(),
    Supplier.find({ status: "active" }).select("totalDue").lean(),
    SalaryPayment.find({ ...range("paymentDate", start, end) }).lean(),
    ProfitSharePayment.find({ ...range("paymentDate", start, end) }).lean(),
  ]);
  const result = {
    totalSales: sum(sales, "totalAmount"),
    totalLpgSold: sum(sales, "totalLpgKg"),
    totalCylindersSold: sum(sales, "totalCylinderCount"),
    totalCustomerPayments: sum(customerPayments, "amount"),
    totalSupplierPayments: sum(supplierPayments, "amount"),
    totalExpenses: sum(expenses, "amount"),
    grossProfit: sum(sales, "grossProfit"),
    currentLpgStock: round(sum(batches, "remainingQuantityKg"), 3),
    totalSalaryPaid: sum(salaryPayments, "amount"),
    totalProfitSharePaid: sum(profitShares, "amount"),
  };
  result.operatingProfit = round(
    result.grossProfit - result.totalExpenses - result.totalSalaryPaid,
    2,
  );
  result.customerDue = round(sum(customers, "totalDue"), 2);
  result.supplierPayable = round(sum(suppliers, "totalDue"), 2);
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
  ] = await Promise.all([
    SalaryPayment.find({ ...range("paymentDate", from, to) }).lean(),
    ProfitSharePayment.find({ ...range("paymentDate", from, to) }).lean(),
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
    Customer.find({ status: "active" }).select("totalDue").lean(),
    Supplier.find({ status: "active" }).select("totalDue").lean(),
  ]);
  const result = {
    totalLpgPurchased: sum(purchases, "quantityKg"),
    totalLpgSold: sum(sales, "totalLpgKg"),
    totalCylindersSold: sum(sales, "totalCylinderCount"),
    totalSalesRevenue: sum(sales, "totalAmount"),
    totalCogs: sum(sales, "totalCost"),
    grossProfit: sum(sales, "grossProfit"),
    totalExpenses: sum(expenses, "amount"),
    customerPayments: sum(customerPayments, "amount"),
    supplierPayments: sum(supplierPayments, "amount"),
    closingLpgStock: round(sum(batches, "remainingQuantityKg"), 3),
    customerOutstanding: sum(customers, "totalDue"),
    supplierOutstanding: sum(suppliers, "totalDue"),
    totalSalaryPaid: sum(salaryPayments, "amount"),
    totalProfitSharePaid: sum(profitShares, "amount"),
  };
  result.operatingProfit = round(
    result.grossProfit - result.totalExpenses - result.totalSalaryPaid,
    2,
  );
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
