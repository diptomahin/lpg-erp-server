import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import {
  customerLedger,
  supplierLedger,
  partyBalance,
} from "../services/ledgerService.js";
import {
  dailyReport,
  monthlyReport,
  batchProfit,
} from "../services/reportingService.js";
import { adjustStock } from "../services/inventoryService.js";
import { voidPurchase } from "../services/purchaseService.js";
import { stockAdjustmentInput } from "../validators/index.js";
import { round } from "../utils/numbers.js";
import { dateRange } from "../utils/dateRange.js";
import { env } from "../config/env.js";
import {
  asyncHandler,
  ok,
  fail,
  paginate,
  listResponse,
} from "../utils/api.js";
import {
  authLogin,
  me,
  password,
  list,
  create,
  update,
  remove,
  createPurchaseController,
  createSaleController,
  voidSaleController,
  payment,
  genericList,
  modelMap,
  listPeople,
  createPerson,
  createSalaryPayment,
  createProfitShare,
  listSalaryPayments,
  listProfitShares,
} from "../controllers/coreController.js";
import {
  Purchase,
  PurchaseBatch,
  Sale,
  CustomerPayment,
  SupplierPayment,
  StockMovement,
  Expense,
  Customer,
  Supplier,
  SaleBatchAllocation,
} from "../models/index.js";
const router = Router();
router.post("/auth/login", asyncHandler(authLogin));
router.get("/auth/me", authenticate, asyncHandler(me));
router.use(authenticate);
router.put("/auth/password", asyncHandler(password));
router.get("/people", asyncHandler(listPeople));
router.post("/people", authorize("admin"), asyncHandler(createPerson));
router.put(
  "/people/:id",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const row = await (
      await import("../models/index.js")
    ).StaffMember.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    return row
      ? ok(res, "Person updated successfully", row)
      : fail(res, "Person not found", [], 404);
  }),
);
router.get("/salary-payments", asyncHandler(listSalaryPayments));
router.post(
  "/salary-payments",
  authorize("admin"),
  asyncHandler(createSalaryPayment),
);
router.get("/profit-shares", asyncHandler(listProfitShares));
router.post(
  "/profit-shares",
  authorize("admin"),
  asyncHandler(createProfitShare),
);
router.get(
  "/customers/:id",
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Customer fetched",
      await (
        await import("../models/index.js")
      ).Customer.findById(req.params.id),
    ),
  ),
);
router.get(
  "/suppliers/:id",
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Supplier fetched",
      await (
        await import("../models/index.js")
      ).Supplier.findById(req.params.id),
    ),
  ),
);
router.get(
  "/customers/:id/overview",
  asyncHandler(async (req, res) => {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return fail(res, "Customer not found", [], 404);
    const [sales, payments, ledger] = await Promise.all([
      Sale.find({ customer: req.params.id, status: "completed" })
        .populate("items.cylinderType")
        .sort({ saleDate: -1 })
        .lean(),
      CustomerPayment.find({ customer: req.params.id, status: "active" })
        .populate("sale")
        .sort({ paymentDate: -1 })
        .lean(),
      customerLedger(req.params.id),
    ]);
    return ok(res, "Customer overview fetched", {
      customer,
      sales,
      payments,
      ledger,
      totals: {
        sales: round(
          sales.reduce(
            (total, sale) => total + Number(sale.totalAmount || 0),
            0,
          ),
          2,
        ),
        paid: round(
          payments
            .filter(
              (payment) =>
                payment.paymentType !== "advance" &&
                payment.paymentType !== "advance_application",
            )
            .reduce((total, payment) => total + Number(payment.amount || 0), 0),
          2,
        ),
        advance: round(Number(customer.advanceBalance || 0), 2),
        due: round(Number(customer.totalDue || 0), 2),
      },
    });
  }),
);
router.get(
  "/dues",
  asyncHandler(async (req, res) => {
    const customers = await Customer.find({
      status: "active",
      totalDue: { $gt: 0 },
    })
      .sort({ totalDue: -1, name: 1 })
      .lean();
    const rows = await Promise.all(
      customers.map(async (customer) => {
        const lastPayment = await CustomerPayment.findOne({
          customer: customer._id,
          status: "active",
        })
          .sort({ paymentDate: -1 })
          .select("paymentDate amount paymentMethod")
          .lean();
        return { ...customer, lastPayment };
      }),
    );
    return ok(res, "Customer dues fetched", rows);
  }),
);
router.get(
  "/advances",
  asyncHandler(async (req, res) => {
    const customers = await Customer.find({
      status: "active",
      advanceBalance: { $gt: 0 },
    })
      .sort({ advanceBalance: -1, name: 1 })
      .lean();
    const rows = await Promise.all(
      customers.map(async (customer) => ({
        ...customer,
        advances: await CustomerPayment.find({
          customer: customer._id,
          paymentType: "advance",
          status: "active",
          remainingAmount: { $gt: 0 },
        })
          .sort({ paymentDate: -1 })
          .select("paymentDate amount remainingAmount paymentMethod reference")
          .lean(),
      })),
    );
    return ok(res, "Customer advances fetched", rows);
  }),
);
const withResource = (resource, handler) => async (req, res, next) => {
  req.params.resource = resource;
  return handler(req, res, next);
};

for (const resource of [
  "customers",
  "suppliers",
  "cylinder-types",
  "expenses",
  "expense-categories",
  "prices",
]) {
  router.get(`/${resource}`, asyncHandler(withResource(resource, list)));
  router.get(
    `/${resource}/:id`,
    asyncHandler(
      withResource(resource, async (req, res) => {
        const Model = modelMap[resource];
        const row = await Model.findById(req.params.id);
        return row
          ? ok(res, "Record fetched", row)
          : fail(res, "Record not found", [], 404);
      }),
    ),
  );
  router.post(`/${resource}`, asyncHandler(withResource(resource, create)));
  router.put(`/${resource}/:id`, asyncHandler(withResource(resource, update)));
  router.delete(
    `/${resource}/:id`,
    asyncHandler(withResource(resource, remove)),
  );
}
router.get("/purchases", asyncHandler(genericList(Purchase)));
router.post(
  "/purchases",
  authorize("admin", "staff"),
  asyncHandler(createPurchaseController),
);
router.get(
  "/purchases/:id",
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Purchase fetched",
      await Purchase.findById(req.params.id).populate("supplier"),
    ),
  ),
);
router.post(
  "/purchases/:id/void",
  authorize("admin"),
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Purchase voided successfully",
      await voidPurchase(req.params.id, req.user),
    ),
  ),
);
router.get("/purchase-batches", asyncHandler(genericList(PurchaseBatch)));
router.get(
  "/purchase-batches/:id",
  asyncHandler(async (req, res) => {
    const batch = await PurchaseBatch.findById(req.params.id)
      .populate("purchase")
      .populate("supplier");
    if (!batch) return fail(res, "Batch not found", [], 404);
    const allocations = await SaleBatchAllocation.find({ batch: batch._id })
      .populate({
        path: "sale",
        populate: [{ path: "customer" }, { path: "items.cylinderType" }],
      })
      .sort({ createdAt: 1 })
      .lean();
    const history = allocations.map((allocation) => {
      const sale = allocation.sale;
      const saleRevenue = sale?.totalLpgKg
        ? round((allocation.quantityKg / sale.totalLpgKg) * sale.totalAmount, 2)
        : 0;
      return {
        ...allocation,
        saleRevenue,
        realizedProfit: round(saleRevenue - allocation.totalCost, 2),
      };
    });
    return ok(res, "Batch history fetched", {
      batch,
      history,
      totals: {
        soldKg: round(
          history.reduce((sum, item) => sum + Number(item.quantityKg || 0), 0),
          3,
        ),
        revenue: round(
          history.reduce((sum, item) => sum + Number(item.saleRevenue || 0), 0),
          2,
        ),
        cost: round(
          history.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
          2,
        ),
        realizedProfit: round(
          history.reduce(
            (sum, item) => sum + Number(item.realizedProfit || 0),
            0,
          ),
          2,
        ),
      },
    });
  }),
);
router.get("/sales", asyncHandler(genericList(Sale)));
router.post("/sales", asyncHandler(createSaleController));
router.get(
  "/sales/:id",
  asyncHandler(async (req, res) =>
    ok(res, "Sale fetched", {
      sale: await Sale.findById(req.params.id)
        .populate("customer")
        .populate("items.cylinderType"),
      allocations: await SaleBatchAllocation.find({
        sale: req.params.id,
      }).populate("batch"),
    }),
  ),
);
router.post(
  "/sales/:id/void",
  authorize("admin"),
  asyncHandler(voidSaleController),
);
router.get(
  "/customer-payments",
  asyncHandler(async (req, res) => {
    const { page, limit } = paginate(req);
    const [rows, total] = await Promise.all([
      CustomerPayment.find({})
        .populate("customer")
        .populate("sale")
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ paymentDate: -1 }),
      CustomerPayment.countDocuments({}),
    ]);
    return listResponse(
      res,
      "Customer payments fetched",
      rows,
      total,
      page,
      limit,
    );
  }),
);
router.post("/customer-payments", asyncHandler(payment("customer")));
router.get(
  "/customer-payments/:id",
  asyncHandler(async (req, res) =>
    ok(res, "Payment fetched", await CustomerPayment.findById(req.params.id)),
  ),
);
router.get(
  "/supplier-payments",
  asyncHandler(async (req, res) => {
    const { page, limit } = paginate(req);
    const [rows, total] = await Promise.all([
      SupplierPayment.find({})
        .populate("supplier")
        .populate("purchase")
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ paymentDate: -1 }),
      SupplierPayment.countDocuments({}),
    ]);
    return listResponse(
      res,
      "Supplier payments fetched",
      rows,
      total,
      page,
      limit,
    );
  }),
);
router.post("/supplier-payments", asyncHandler(payment("supplier")));
router.get(
  "/supplier-payments/:id",
  asyncHandler(async (req, res) =>
    ok(res, "Payment fetched", await SupplierPayment.findById(req.params.id)),
  ),
);
router.get(
  "/inventory",
  asyncHandler(async (req, res) => {
    const batches = await PurchaseBatch.find({ status: { $ne: "cancelled" } });
    return ok(res, "Inventory fetched", {
      availableKg: batches.reduce((sum, b) => sum + b.remainingQuantityKg, 0),
      batches,
    });
  }),
);
router.get("/stock-movements", asyncHandler(genericList(StockMovement)));
router.post(
  "/stock-adjustments",
  authorize("admin"),
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Stock adjustment recorded",
      await adjustStock(stockAdjustmentInput.parse(req.body), req.user),
      201,
    ),
  ),
);
router.get(
  "/reports/inventory",
  asyncHandler(async (req, res) => {
    const batches = await PurchaseBatch.find({});
    return ok(res, "Inventory report", {
      currentKg: batches.reduce((sum, b) => sum + b.remainingQuantityKg, 0),
      batches,
    });
  }),
);
router.post(
  "/settings/theoretical-profit",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    if (!env.theoreticalProfitPassword) {
      return fail(
        res,
        "Theoretical profit password is not configured.",
        [],
        503,
      );
    }
    if (req.body?.password !== env.theoreticalProfitPassword) {
      return fail(res, "Incorrect theoretical profit password.", [], 401);
    }
    return ok(res, "Theoretical profit setting authorized", {
      enabled: Boolean(req.body?.enabled),
    });
  }),
);
const report = (Model, label) =>
  asyncHandler(async (req, res) => {
    const { page, limit } = paginate(req);
    const query = {};
    if (req.query.from || req.query.to)
      query[Model === Sale ? "saleDate" : "purchaseDate"] = dateRange(
        req.query.from,
        req.query.to,
      );
    const [rows, total] = await Promise.all([
      Model.find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Model.countDocuments(query),
    ]);
    listResponse(res, label, rows, total, page, limit);
  });
router.get(
  "/reports/sales",
  asyncHandler(async (req, res) => {
    const { page, limit } = paginate(req);
    const query = {};
    if (req.query.from || req.query.to) {
      query.saleDate = {
        ...dateRange(req.query.from, req.query.to),
      };
    }
    const [sales, total] = await Promise.all([
      Sale.find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ saleDate: -1 })
        .lean(),
      Sale.countDocuments(query),
    ]);
    const rows = sales.map((sale) => ({
      ...sale,
      purchasePricePerKg: sale.totalLpgKg
        ? round(sale.totalCost / sale.totalLpgKg, 4)
        : 0,
      sellingPricePerKg: sale.totalLpgKg
        ? round(sale.totalAmount / sale.totalLpgKg, 4)
        : 0,
      theoreticalProfit: round(
        sale.grossProfit ?? sale.totalAmount - sale.totalCost,
        2,
      ),
    }));
    return listResponse(res, "Sales report", rows, total, page, limit);
  }),
);
router.get("/reports/purchases", report(Purchase, "Purchase report"));
router.get(
  "/reports/profit",
  asyncHandler(async (req, res) => {
    const rows = await Sale.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totalAmount" },
          cogs: { $sum: "$totalCost" },
          grossProfit: { $sum: "$grossProfit" },
        },
      },
    ]);
    return ok(
      res,
      "Profit report",
      rows[0] || { revenue: 0, cogs: 0, grossProfit: 0 },
    );
  }),
);
router.get(
  "/reports/daily",
  asyncHandler(async (req, res) =>
    ok(res, "Daily report", await dailyReport(req.query)),
  ),
);
router.get(
  "/reports/monthly",
  asyncHandler(async (req, res) =>
    ok(res, "Monthly report", await monthlyReport(req.query)),
  ),
);
router.get(
  "/reports/batch-profit",
  asyncHandler(async (req, res) =>
    ok(res, "Batch profit report", await batchProfit(req.query)),
  ),
);
router.get(
  "/reports/customer-dues",
  asyncHandler(async (req, res) => {
    const customers = await Customer.find({ status: "active" }).lean();
    const rows = await Promise.all(
      customers.map(async (customer) => ({
        customer,
        outstanding: await partyBalance(
          Customer,
          Sale,
          CustomerPayment,
          customer._id,
          "customer",
        ),
      })),
    );
    return ok(res, "Customer dues report", rows);
  }),
);
router.get(
  "/reports/supplier-payables",
  asyncHandler(async (req, res) => {
    const suppliers = await Supplier.find({ status: "active" }).lean();
    const rows = await Promise.all(
      suppliers.map(async (supplier) => ({
        supplier,
        outstanding: await partyBalance(
          Supplier,
          Purchase,
          SupplierPayment,
          supplier._id,
          "supplier",
        ),
      })),
    );
    return ok(res, "Supplier payables report", rows);
  }),
);
router.get(
  "/reports/expenses",
  asyncHandler(async (req, res) => {
    const rows = await Expense.find({
      ...(req.query.from || req.query.to
        ? {
            expenseDate: dateRange(req.query.from, req.query.to),
          }
        : {}),
      status: "active",
    })
      .populate("category")
      .sort({ expenseDate: -1 });
    return ok(res, "Expense report", rows);
  }),
);
router.get(
  "/dashboard/summary",
  asyncHandler(async (req, res) => {
    const today = new Date();
    const from = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const to = new Date(from.getTime() + 86400000 - 1);
    return ok(res, "Dashboard summary", await dailyReport({ from, to }));
  }),
);
router.get(
  "/dashboard/recent-sales",
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Recent sales",
      await Sale.find({ status: "completed" })
        .sort({ saleDate: -1 })
        .limit(10)
        .populate("customer"),
    ),
  ),
);
router.get(
  "/dashboard/recent-purchases",
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Recent purchases",
      await Purchase.find({ status: "completed" })
        .sort({ purchaseDate: -1 })
        .limit(10)
        .populate("supplier"),
    ),
  ),
);
router.get(
  "/dashboard/recent-payments",
  asyncHandler(async (req, res) => {
    const [customer, supplier] = await Promise.all([
      CustomerPayment.find()
        .sort({ paymentDate: -1 })
        .limit(10)
        .populate("customer"),
      SupplierPayment.find()
        .sort({ paymentDate: -1 })
        .limit(10)
        .populate("supplier"),
    ]);
    return ok(
      res,
      "Recent payments",
      [...customer, ...supplier]
        .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
        .slice(0, 10),
    );
  }),
);
router.get(
  "/customers/:id/ledger",
  asyncHandler(async (req, res) => {
    const ledger = await customerLedger(req.params.id, req.query);
    return ledger
      ? ok(res, "Customer ledger", ledger)
      : fail(res, "Customer not found", [], 404);
  }),
);
router.get(
  "/customers/:id/sales",
  asyncHandler(async (req, res) =>
    ok(res, "Customer sales", await Sale.find({ customer: req.params.id })),
  ),
);
router.get(
  "/customers/:id/payments",
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Customer payments",
      await CustomerPayment.find({ customer: req.params.id }),
    ),
  ),
);
router.get(
  "/suppliers/:id/ledger",
  asyncHandler(async (req, res) => {
    const ledger = await supplierLedger(req.params.id, req.query);
    return ledger
      ? ok(res, "Supplier ledger", ledger)
      : fail(res, "Supplier not found", [], 404);
  }),
);
router.get(
  "/suppliers/:id/purchases",
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Supplier purchases",
      await Purchase.find({ supplier: req.params.id }),
    ),
  ),
);
router.get(
  "/suppliers/:id/payments",
  asyncHandler(async (req, res) =>
    ok(
      res,
      "Supplier payments",
      await SupplierPayment.find({ supplier: req.params.id }),
    ),
  ),
);
export default router;
