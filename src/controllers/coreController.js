import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  User,
  Customer,
  Supplier,
  CylinderType,
  Purchase,
  PurchaseBatch,
  Sale,
  CustomerPayment,
  SupplierPayment,
  Expense,
  ExpenseCategory,
  StockMovement,
  PriceHistory,
  StaffMember,
  SalaryPayment,
  ProfitSharePayment,
} from "../models/index.js";
import { ok, fail, paginate, listResponse } from "../utils/api.js";
import { changePassword, login } from "../services/authService.js";
import { createPurchase } from "../services/purchaseService.js";
import { createSale, voidSale } from "../services/saleService.js";
import { createPayment } from "../services/paymentService.js";
import { purchaseInput, saleInput, paymentInput } from "../validators/index.js";
const recordNumber = (prefix) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
export const modelMap = {
  customers: Customer,
  suppliers: Supplier,
  "cylinder-types": CylinderType,
  expenses: Expense,
  "expense-categories": ExpenseCategory,
  prices: PriceHistory,
};
export const listPeople = async (req, res) => {
  const { page, limit } = paginate(req);
  const [rows, total] = await Promise.all([
    StaffMember.find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    StaffMember.countDocuments({}),
  ]);
  return listResponse(res, "People fetched", rows, total, page, limit);
};
export const createPerson = async (req, res) => {
  if (!req.body.name?.trim()) return fail(res, "Name is required", [], 400);
  if (!req.body.isEmployee && !req.body.isPartner)
    return fail(res, "Person must be an employee, partner, or both", [], 400);
  const share = Number(req.body.partnerSharePercent || 0);
  if (share < 0 || share > 100)
    return fail(res, "Partner share must be between 0 and 100", [], 400);
  const row = await StaffMember.create({
    ...req.body,
    createdBy: req.user._id,
  });
  return ok(res, "Person created successfully", row, 201);
};
export const createSalaryPayment = async (req, res) => {
  const person = await StaffMember.findOne({
    _id: req.body.person,
    status: "active",
  });
  if (!person || !person.isEmployee)
    return fail(res, "Active employee not found", [], 400);
  if (!(Number(req.body.amount) > 0))
    return fail(res, "Amount must be positive", [], 400);
  const row = await SalaryPayment.create({
    ...req.body,
    createdBy: req.user._id,
  });
  return ok(res, "Salary payment recorded successfully", row, 201);
};
export const createProfitShare = async (req, res) => {
  const person = await StaffMember.findOne({
    _id: req.body.person,
    status: "active",
  });
  if (!person || !person.isPartner)
    return fail(res, "Active partner not found", [], 400);
  if (!(Number(req.body.amount) > 0))
    return fail(res, "Amount must be positive", [], 400);
  const row = await ProfitSharePayment.create({
    ...req.body,
    createdBy: req.user._id,
  });
  return ok(res, "Profit share recorded successfully", row, 201);
};
export const listSalaryPayments = async (req, res) => {
  const { page, limit } = paginate(req);
  const [rows, total] = await Promise.all([
    SalaryPayment.find({})
      .populate("person")
      .sort({ paymentDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SalaryPayment.countDocuments({}),
  ]);
  return listResponse(res, "Salary payments fetched", rows, total, page, limit);
};
export const listProfitShares = async (req, res) => {
  const { page, limit } = paginate(req);
  const [rows, total] = await Promise.all([
    ProfitSharePayment.find({})
      .populate("person")
      .sort({ paymentDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ProfitSharePayment.countDocuments({}),
  ]);
  return listResponse(res, "Profit shares fetched", rows, total, page, limit);
};
export const resolveResource = (req) => {
  if (req.params?.resource) return req.params.resource;
  const segments = (req.path || "").split("/").filter(Boolean);
  return segments[0] || null;
};
export const authLogin = async (req, res) =>
  ok(res, "Login successful", await login(req.body.email, req.body.password));
export const me = async (req, res) => ok(res, "Authenticated user", req.user);
export const password = async (req, res) => {
  await changePassword(
    req.user._id,
    req.body.currentPassword,
    req.body.newPassword,
  );
  return ok(res, "Password updated successfully");
};
export const list = async (req, res) => {
  const resource = resolveResource(req);
  const Model = modelMap[resource];
  if (!Model) return fail(res, "Resource not found", [], 404);
  const { page, limit } = paginate(req);
  const query = req.query.search
    ? {
        $or: ["name", "companyName", "phone"].map((key) => ({
          [key]: new RegExp(req.query.search, "i"),
        })),
      }
    : {};
  const [rows, total] = await Promise.all([
    Model.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Model.countDocuments(query),
  ]);
  return listResponse(res, "Records fetched", rows, total, page, limit);
};
export const create = async (req, res) => {
  const resource = resolveResource(req);
  const Model = modelMap[resource];
  if (!Model) return fail(res, "Resource not found", [], 404);
  const data = { ...req.body, createdBy: req.user._id };
  if (resource === "expenses") {
    data.expenseNumber = recordNumber("EXP");
  } else if (resource === "customers") {
    const receivable = Number(
      data.existingReceivable ?? data.openingBalance ?? 0,
    );
    data.existingReceivable = receivable;
    data.totalDue = receivable;
    data.migrationReceivable = receivable;
    delete data.openingBalance;
  } else if (resource === "suppliers") {
    const payable = Number(data.existingPayable ?? data.openingBalance ?? 0);
    data.existingPayable = payable;
    data.totalDue = payable;
    data.migrationPayable = payable;
    delete data.openingBalance;
  }
  const row = await Model.create(data);
  return ok(res, "Record created successfully", row, 201);
};
export const update = async (req, res) => {
  const resource = resolveResource(req);
  const Model = modelMap[resource];
  if (resource === "customers" || resource === "suppliers") {
    const balanceField =
      resource === "customers" ? "existingReceivable" : "existingPayable";
    delete req.body.openingBalance;
    delete req.body.totalDue;
    delete req.body[balanceField];
  }
  const row = await Model.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  return row
    ? ok(res, "Record updated successfully", row)
    : fail(res, "Record not found", [], 404);
};
export const remove = async (req, res) => {
  const resource = resolveResource(req);
  const Model = modelMap[resource];
  const row = await Model.findByIdAndUpdate(
    req.params.id,
    { status: "inactive" },
    { new: true },
  );
  return row
    ? ok(res, "Record deactivated", row)
    : fail(res, "Record not found", [], 404);
};
export const createPurchaseController = async (req, res) =>
  ok(
    res,
    "Purchase created successfully",
    await createPurchase(purchaseInput.parse(req.body), req.user),
    201,
  );
export const createSaleController = async (req, res) =>
  ok(
    res,
    "Sale created successfully",
    await createSale(saleInput.parse(req.body), req.user),
    201,
  );
export const voidSaleController = async (req, res) =>
  ok(res, "Sale voided successfully", await voidSale(req.params.id, req.user));
export const payment = (kind) => async (req, res) =>
  ok(
    res,
    "Payment recorded successfully",
    await createPayment(kind, paymentInput.parse(req.body), req.user),
    201,
  );
export const genericList = (Model) => async (req, res) => {
  const { page, limit } = paginate(req);
  const query = { ...req.query };
  delete query.page;
  delete query.limit;

  const dateField =
    Model.modelName === "Sale"
      ? "saleDate"
      : Model.modelName === "Purchase"
        ? "purchaseDate"
        : null;
  if (dateField && query[dateField]) {
    const start = new Date(query[dateField]);
    const end = new Date(query[dateField]);
    end.setHours(23, 59, 59, 999);
    query[dateField] = { $gte: start, $lte: end };
  }

  const [rows, total] = await Promise.all([
    Model.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Model.countDocuments(query),
  ]);
  listResponse(res, "Records fetched", rows, total, page, limit);
};
