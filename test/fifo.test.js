import test from "node:test";
import assert from "node:assert/strict";
import { tonToKg, round } from "../src/utils/numbers.js";
import { calculateFifoAllocations } from "../src/services/fifoService.js";
import { purchaseInput } from "../src/validators/index.js";
test("converts ton to normalized kg", () => assert.equal(tonToKg(10), 10000));
test("accepts irregular purchase quantities in kg", () => {
  const result = purchaseInput.parse({
    supplier: "507f1f77bcf86cd799439011",
    quantityKg: 7689,
    purchaseRatePerKg: 84.5,
  });
  assert.equal(result.quantityKg, 7689);
  assert.equal(result.purchaseRatePerKg, 84.5);
});
test("rejects ambiguous purchase units", () =>
  assert.throws(() =>
    purchaseInput.parse({
      supplier: "507f1f77bcf86cd799439011",
      quantityKg: 7689,
      quantityTon: 7.689,
      purchaseRatePerKg: 84.5,
    }),
  ));
test("requires purchase price per kg", () =>
  assert.throws(() =>
    purchaseInput.parse({
      supplier: "507f1f77bcf86cd799439011",
      quantityKg: 7689,
      purchaseRatePerTon: 84500,
    }),
  ));
test("calculates cylinder quantities without floating drift", () =>
  assert.equal(round(5 * 12 + 2 * 30 + 1 * 45, 3), 165));
test("supports decimal kg values", () =>
  assert.equal(round(1.125 * 1000, 3), 1125));
test("allocates FIFO across multiple batches", () => {
  const result = calculateFifoAllocations(500, [
    { _id: "A", remainingQuantityKg: 200, acquisitionCostPerKg: 100 },
    { _id: "B", remainingQuantityKg: 8000, acquisitionCostPerKg: 115 },
  ]);
  assert.deepEqual(
    result.allocations.map(({ batchId, quantityKg }) => ({
      batchId,
      quantityKg,
    })),
    [
      { batchId: "A", quantityKg: 200 },
      { batchId: "B", quantityKg: 300 },
    ],
  );
  assert.equal(result.totalCost, 54500);
});
test("allocates one complete cylinder across batches", () => {
  const result = calculateFifoAllocations(12, [
    { _id: "A", remainingQuantityKg: 8, purchaseCostPerKg: 100 },
    { _id: "B", remainingQuantityKg: 20, purchaseCostPerKg: 115 },
  ]);
  assert.deepEqual(
    result.allocations.map(({ quantityKg }) => quantityKg),
    [8, 4],
  );
});
test("rejects insufficient inventory without allocations", () => {
  const result = calculateFifoAllocations(120, [
    { _id: "A", remainingQuantityKg: 100, purchaseCostPerKg: 100 },
  ]);
  assert.equal(result.insufficient, true);
  assert.equal(result.shortageKg, 20);
  assert.deepEqual(result.allocations, []);
});
