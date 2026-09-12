import mongoose from "mongoose";
const { Schema, model } = mongoose;
const timestamps = true;
const ref = (name) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required: true,
});

export const User = model(
  "User",
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        index: true,
      },
      password: { type: String, required: true, select: false },
      role: { type: String, enum: ["admin", "staff"], default: "staff" },
      status: { type: String, enum: ["active", "inactive"], default: "active" },
    },
    { timestamps },
  ),
);
const party = (extra = {}) =>
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      companyName: String,
      phone: String,
      address: String,
      totalDue: { type: Number, default: 0 },
      status: { type: String, enum: ["active", "inactive"], default: "active" },
      notes: String,
      ...extra,
    },
    { timestamps },
  );
export const Customer = model(
  "Customer",
  party({
    existingReceivable: { type: Number, min: 0, default: 0 },
    migrationReceivable: { type: Number, min: 0, default: 0, select: false },
    creditLimit: { type: Number, default: 0 },
  }),
);
export const Supplier = model(
  "Supplier",
  party({
    existingPayable: { type: Number, min: 0, default: 0 },
    migrationPayable: { type: Number, min: 0, default: 0, select: false },
  }),
);
export const CylinderType = model(
  "CylinderType",
  new Schema(
    {
      name: { type: String, required: true, unique: true },
      capacityKg: { type: Number, required: true, min: 0.001 },
      status: { type: String, enum: ["active", "inactive"], default: "active" },
    },
    { timestamps },
  ),
);
export const Purchase = model(
  "Purchase",
  new Schema(
    {
      purchaseNumber: { type: String, unique: true, index: true },
      supplier: ref("Supplier"),
      purchaseDate: { type: Date, default: Date.now, index: true },
      quantityTon: Number,
      quantityKg: Number,
      purchaseRatePerTon: Number,
      purchaseRatePerKg: Number,
      subtotal: Number,
      additionalCost: { type: Number, default: 0 },
      totalCost: Number,
      totalPaid: { type: Number, default: 0 },
      totalDue: Number,
      paymentStatus: {
        type: String,
        enum: ["unpaid", "partial", "paid"],
        default: "unpaid",
      },
      notes: String,
      createdBy: ref("User"),
      status: {
        type: String,
        enum: ["completed", "void"],
        default: "completed",
      },
    },
    { timestamps },
  ),
);
export const PurchaseBatch = model(
  "PurchaseBatch",
  new Schema(
    {
      batchNumber: { type: String, unique: true, index: true },
      purchase: ref("Purchase"),
      supplier: ref("Supplier"),
      batchDate: { type: Date, index: true },
      originalQuantityKg: Number,
      remainingQuantityKg: Number,
      purchaseCostPerKg: Number,
      additionalCost: { type: Number, default: 0 },
      acquisitionCostPerKg: Number,
      status: {
        type: String,
        enum: ["available", "exhausted", "cancelled"],
        default: "available",
      },
    },
    { timestamps },
  ),
);
const saleItem = new Schema(
  {
    cylinderType: ref("CylinderType"),
    capacityKg: Number,
    cylinderCount: { type: Number, min: 1 },
    totalLpgKg: Number,
    pricePerCylinder: { type: Number, min: 0 },
    ratePerKg: { type: Number, min: 0 },
    totalAmount: Number,
  },
  { _id: false },
);
export const Sale = model(
  "Sale",
  new Schema(
    {
      invoiceNumber: { type: String, unique: true, index: true },
      customer: ref("Customer"),
      saleDate: { type: Date, default: Date.now, index: true },
      items: [saleItem],
      totalCylinderCount: Number,
      totalLpgKg: Number,
      subtotal: Number,
      discount: { type: Number, default: 0 },
      totalAmount: Number,
      totalCost: Number,
      grossProfit: Number,
      totalPaid: { type: Number, default: 0 },
      totalDue: Number,
      paymentStatus: {
        type: String,
        enum: ["unpaid", "partial", "paid"],
        default: "unpaid",
      },
      createdBy: ref("User"),
      status: {
        type: String,
        enum: ["completed", "void"],
        default: "completed",
      },
    },
    { timestamps },
  ),
);
export const SaleBatchAllocation = model(
  "SaleBatchAllocation",
  new Schema(
    {
      sale: ref("Sale"),
      batch: ref("PurchaseBatch"),
      quantityKg: Number,
      costPerKg: Number,
      totalCost: Number,
    },
    { timestamps },
  ),
);
const payment = (name, partyName, transactionName) =>
  model(
    name,
    new Schema(
      {
        paymentNumber: { type: String, unique: true, index: true },
        [partyName]: ref(partyName[0].toUpperCase() + partyName.slice(1)),
        [transactionName]: {
          type: Schema.Types.ObjectId,
          ref: transactionName[0].toUpperCase() + transactionName.slice(1),
        },
        amount: { type: Number, min: 0.01 },
        paymentDate: { type: Date, default: Date.now, index: true },
        paymentMethod: String,
        reference: String,
        notes: String,
        status: { type: String, enum: ["active", "void"], default: "active" },
        createdBy: ref("User"),
      },
      { timestamps },
    ),
  );
export const CustomerPayment = payment("CustomerPayment", "customer", "sale");
export const SupplierPayment = payment(
  "SupplierPayment",
  "supplier",
  "purchase",
);
export const ExpenseCategory = model(
  "ExpenseCategory",
  new Schema(
    {
      name: { type: String, unique: true },
      status: { type: String, default: "active" },
    },
    { timestamps },
  ),
);
export const Expense = model(
  "Expense",
  new Schema(
    {
      expenseNumber: { type: String, required: true, unique: true },
      category: { type: Schema.Types.ObjectId, ref: "ExpenseCategory" },
      amount: { type: Number, min: 0.01 },
      expenseDate: { type: Date, default: Date.now, index: true },
      paymentMethod: String,
      description: String,
      notes: String,
      createdBy: ref("User"),
      status: { type: String, default: "active" },
    },
    { timestamps },
  ),
);
export const StaffMember = model(
  "StaffMember",
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      phone: String,
      email: String,
      address: String,
      isEmployee: { type: Boolean, default: true },
      isPartner: { type: Boolean, default: false },
      monthlySalary: { type: Number, min: 0, default: 0 },
      partnerSharePercent: { type: Number, min: 0, max: 100, default: 0 },
      status: { type: String, enum: ["active", "inactive"], default: "active" },
      notes: String,
      createdBy: ref("User"),
    },
    { timestamps },
  ),
);
const payout = (name, kind) =>
  model(
    name,
    new Schema(
      {
        person: ref("StaffMember"),
        amount: { type: Number, min: 0.01, required: true },
        paymentDate: { type: Date, default: Date.now, index: true },
        period: String,
        paymentMethod: String,
        reference: String,
        notes: String,
        kind: { type: String, default: kind },
        createdBy: ref("User"),
      },
      { timestamps },
    ),
  );
export const SalaryPayment = payout("SalaryPayment", "salary");
export const ProfitSharePayment = payout("ProfitSharePayment", "profit_share");
export const StockMovement = model(
  "StockMovement",
  new Schema(
    {
      movementNumber: { type: String, unique: true },
      type: {
        type: String,
        enum: [
          "PURCHASE",
          "SALE",
          "ADJUSTMENT_IN",
          "ADJUSTMENT_OUT",
          "RETURN",
          "CORRECTION",
        ],
      },
      quantityKg: Number,
      batch: { type: Schema.Types.ObjectId, ref: "PurchaseBatch" },
      referenceType: String,
      referenceId: Schema.Types.ObjectId,
      date: { type: Date, default: Date.now, index: true },
      notes: String,
      createdBy: ref("User"),
    },
    { timestamps },
  ),
);
export const PriceHistory = model(
  "PriceHistory",
  new Schema(
    {
      effectiveDate: { type: Date, default: Date.now },
      ratePerKg: { type: Number, min: 0 },
      customer: { type: Schema.Types.ObjectId, ref: "Customer" },
      notes: String,
      createdBy: ref("User"),
    },
    { timestamps },
  ),
);
export const AuditLog = model(
  "AuditLog",
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: "User" },
      action: String,
      entityType: String,
      entityId: Schema.Types.ObjectId,
      oldData: Schema.Types.Mixed,
      newData: Schema.Types.Mixed,
    },
    { timestamps },
  ),
);
