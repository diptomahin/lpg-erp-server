import mongoose from "mongoose";
import "dotenv/config";
import { connectDb } from "./config/db.js";
import {
  User,
  Supplier,
  Customer,
  CylinderType,
  ExpenseCategory,
  Expense,
} from "./models/index.js";
import { createPurchase } from "./services/purchaseService.js";
import { createSale } from "./services/saleService.js";

const daysAgo = (days, hour = 9) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};

const ensureUser = async () => {
  const admin = await User.findOne({ email: "admin@example.com" }).lean();
  if (!admin) {
    throw new Error("Admin user not found. Run npm run seed first.");
  }
  return admin;
};

const upsertSupplier = async (name, companyName, phone = "+8801700000000") => {
  const supplier =
    (await Supplier.findOne({
      companyName: { $regex: new RegExp(`^${name}$`, "i") },
    })) ||
    (await Supplier.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    }));

  if (supplier) {
    await Supplier.updateOne(
      { _id: supplier._id },
      {
        $set: {
          name,
          companyName,
          phone,
          address: "Dhaka Industrial Area",
          status: "active",
        },
      },
    );
    return Supplier.findById(supplier._id);
  }

  return Supplier.create({
    name,
    companyName,
    phone,
    address: "Dhaka Industrial Area",
    existingPayable: 0,
    status: "active",
  });
};

const upsertCustomer = async (name, companyName, phone = "+8801800000000") => {
  const customer =
    (await Customer.findOne({
      companyName: { $regex: new RegExp(`^${companyName}$`, "i") },
    })) ||
    (await Customer.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    }));

  if (customer) {
    await Customer.updateOne(
      { _id: customer._id },
      {
        $set: {
          name,
          companyName,
          phone,
          address: "Dhaka City Market",
          creditLimit: 250000,
          status: "active",
        },
      },
    );
    return Customer.findById(customer._id);
  }

  return Customer.create({
    name,
    companyName,
    phone,
    address: "Dhaka City Market",
    creditLimit: 250000,
    existingReceivable: 0,
    status: "active",
  });
};

const main = async () => {
  await connectDb();

  const admin = await ensureUser();

  await ExpenseCategory.bulkWrite(
    [
      "SALARY",
      "TRANSPORT",
      "SHIPPING",
      "ELECTRICITY",
      "FUEL",
      "MAINTENANCE",
      "OFFICE",
      "OTHER",
    ].map((name) => ({
      updateOne: {
        filter: { name },
        update: { $set: { status: "active" } },
        upsert: true,
      },
    })),
  );

  await CylinderType.bulkWrite(
    [12, 30, 35, 45].map((capacityKg) => ({
      updateOne: {
        filter: { name: `${capacityKg} KG` },
        update: { $set: { capacityKg, status: "active" } },
        upsert: true,
      },
    })),
  );

  const supplierMap = {
    apex: await upsertSupplier("Apex Gas Pvt Ltd", "Apex Gas Pvt Ltd"),
    summit: await upsertSupplier("Summit Energy Co", "Summit Energy Co"),
    prime: await upsertSupplier("Prime Allied Supply", "Prime Allied Supply"),
  };

  const customerMap = {
    cityMart: await upsertCustomer("City Mart", "City Mart"),
    metroFuel: await upsertCustomer("Metro Fuel Traders", "Metro Fuel Traders"),
    northSide: await upsertCustomer("Northside Hotel", "Northside Hotel"),
    urbanGas: await upsertCustomer("Urban Gas Service", "Urban Gas Service"),
  };

  const cylinderTypeMap = Object.fromEntries(
    (await CylinderType.find({ status: "active" })).map((type) => [
      type.capacityKg,
      type,
    ]),
  );

  const purchasePlan = [
    {
      supplier: "apex",
      purchaseDate: daysAgo(28),
      quantityTon: 18,
      purchaseRatePerKg: 84,
      additionalCost: 5200,
      totalPaid: 1500000,
      notes: "Bulk LPG import for August cycle",
    },
    {
      supplier: "summit",
      purchaseDate: daysAgo(21),
      quantityTon: 22,
      purchaseRatePerKg: 84.5,
      additionalCost: 6100,
      totalPaid: 1800000,
      notes: "Refill cargo for Dhaka market",
    },
    {
      supplier: "prime",
      purchaseDate: daysAgo(14),
      quantityTon: 20,
      purchaseRatePerKg: 85.2,
      additionalCost: 4700,
      totalPaid: 1700000,
      notes: "Spot purchase with freight included",
    },
    {
      supplier: "apex",
      purchaseDate: daysAgo(6),
      quantityTon: 17,
      purchaseRatePerKg: 85.8,
      additionalCost: 4900,
      totalPaid: 1450000,
      notes: "Late-month replenishment",
    },
  ];

  for (const purchase of purchasePlan) {
    await createPurchase(
      {
        supplier: supplierMap[purchase.supplier]._id,
        purchaseDate: purchase.purchaseDate,
        quantityTon: purchase.quantityTon,
        purchaseRatePerKg: purchase.purchaseRatePerKg,
        additionalCost: purchase.additionalCost,
        totalPaid: purchase.totalPaid,
        notes: purchase.notes,
      },
      admin,
    );
  }

  const salePlan = [
    {
      customer: "cityMart",
      saleDate: daysAgo(24),
      discount: 350,
      totalPaid: 28000,
      items: [
        {
          cylinderType: cylinderTypeMap[12]._id,
          cylinderCount: 120,
          ratePerKg: 62.5,
        },
      ],
    },
    {
      customer: "metroFuel",
      saleDate: daysAgo(19),
      discount: 500,
      totalPaid: 42000,
      items: [
        {
          cylinderType: cylinderTypeMap[30]._id,
          cylinderCount: 58,
          ratePerKg: 58.5,
        },
      ],
    },
    {
      customer: "northSide",
      saleDate: daysAgo(15),
      discount: 0,
      totalPaid: 56000,
      items: [
        {
          cylinderType: cylinderTypeMap[45]._id,
          cylinderCount: 36,
          ratePerKg: 60.5,
        },
      ],
    },
    {
      customer: "urbanGas",
      saleDate: daysAgo(10),
      discount: 820,
      totalPaid: 64000,
      items: [
        {
          cylinderType: cylinderTypeMap[12]._id,
          cylinderCount: 80,
          ratePerKg: 63,
        },
        {
          cylinderType: cylinderTypeMap[30]._id,
          cylinderCount: 20,
          ratePerKg: 59.5,
        },
      ],
    },
    {
      customer: "cityMart",
      saleDate: daysAgo(7),
      discount: 760,
      totalPaid: 91000,
      items: [
        {
          cylinderType: cylinderTypeMap[12]._id,
          cylinderCount: 100,
          ratePerKg: 63.5,
        },
        {
          cylinderType: cylinderTypeMap[45]._id,
          cylinderCount: 18,
          ratePerKg: 61.5,
        },
      ],
    },
    {
      customer: "metroFuel",
      saleDate: daysAgo(3),
      discount: 400,
      totalPaid: 76000,
      items: [
        {
          cylinderType: cylinderTypeMap[30]._id,
          cylinderCount: 95,
          ratePerKg: 60.25,
        },
      ],
    },
  ];

  for (const sale of salePlan) {
    await createSale(
      {
        customer: customerMap[sale.customer]._id,
        saleDate: sale.saleDate,
        discount: sale.discount,
        totalPaid: sale.totalPaid,
        items: sale.items,
      },
      admin,
    );
  }

  const expenseCategoryMap = Object.fromEntries(
    (await ExpenseCategory.find()).map((category) => [category.name, category]),
  );

  const expensePlan = [
    {
      category: "SALARY",
      amount: 48000,
      expenseDate: daysAgo(25),
      description: "Monthly driver and dispatch wages",
      paymentMethod: "BANK_TRANSFER",
    },
    {
      category: "TRANSPORT",
      amount: 18500,
      expenseDate: daysAgo(22),
      description: "Vehicle movement for distribution routes",
      paymentMethod: "CASH",
    },
    {
      category: "SHIPPING",
      amount: 26000,
      expenseDate: daysAgo(18),
      description: "Regional dispatch and delivery freight",
      paymentMethod: "BANK_TRANSFER",
    },
    {
      category: "ELECTRICITY",
      amount: 9600,
      expenseDate: daysAgo(16),
      description: "Warehouse and office electricity",
      paymentMethod: "BANK_TRANSFER",
    },
    {
      category: "FUEL",
      amount: 14250,
      expenseDate: daysAgo(12),
      description: "Loader, forklifts, and delivery vans",
      paymentMethod: "CASH",
    },
    {
      category: "MAINTENANCE",
      amount: 22400,
      expenseDate: daysAgo(9),
      description: "Cylinder inspection and equipment repair",
      paymentMethod: "BANK_TRANSFER",
    },
    {
      category: "OFFICE",
      amount: 8900,
      expenseDate: daysAgo(4),
      description: "Office rent, supplies, and admin support",
      paymentMethod: "BANK_TRANSFER",
    },
  ];

  await Expense.insertMany(
    expensePlan.map((expense) => ({
      expenseNumber: `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      category: expenseCategoryMap[expense.category]._id,
      amount: expense.amount,
      expenseDate: expense.expenseDate,
      paymentMethod: expense.paymentMethod,
      description: expense.description,
      notes: "Demo-data expense for monthly reporting",
      createdBy: admin._id,
      status: "active",
    })),
  );

  console.log(
    JSON.stringify(
      {
        admin: admin.email,
        suppliersCreated: Object.keys(supplierMap).length,
        customersCreated: Object.keys(customerMap).length,
        purchasesInserted: purchasePlan.length,
        salesInserted: salePlan.length,
        expensesInserted: expensePlan.length,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error("Monthly demo seed failed:", error);
  process.exit(1);
});
