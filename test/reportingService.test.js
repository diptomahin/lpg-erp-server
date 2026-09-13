import test from "node:test";
import assert from "node:assert/strict";

import { summarizeCustomerReceipts } from "../src/services/reportingService.js";

test("sale-linked customer receipts are cash and bank methods are classified separately", () => {
  const totals = summarizeCustomerReceipts([
    { amount: 100, sale: "sale-1" },
    { amount: 200, paymentMethod: "bank_transfer" },
    { amount: 300, paymentMethod: "cash" },
    { amount: 50 },
    { amount: 75, sale: "sale-2", paymentMethod: "bank_transfer" },
  ]);

  assert.equal(totals.total, 725);
  assert.equal(totals.cash, 450);
  assert.equal(totals.bank, 275);
});
