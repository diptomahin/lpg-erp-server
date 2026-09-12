import { PurchaseBatch } from "../models/index.js";
import { round } from "../utils/numbers.js";

export function calculateFifoAllocations(requiredKg, batches) {
  const availableKg = round(
    batches.reduce((sum, batch) => sum + batch.remainingQuantityKg, 0),
    3,
  );
  if (availableKg < requiredKg)
    return {
      insufficient: true,
      availableKg,
      shortageKg: round(requiredKg - availableKg, 3),
      allocations: [],
      totalCost: 0,
    };
  let remaining = requiredKg;
  const allocations = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const quantityKg = round(Math.min(remaining, batch.remainingQuantityKg), 3);
    const costPerKg = batch.acquisitionCostPerKg || batch.purchaseCostPerKg;
    allocations.push({
      batchId: batch._id,
      quantityKg,
      costPerKg,
      totalCost: round(quantityKg * costPerKg, 2),
    });
    remaining = round(remaining - quantityKg, 3);
  }
  return {
    allocations,
    totalCost: round(
      allocations.reduce((sum, item) => sum + item.totalCost, 0),
      2,
    ),
    availableKg,
  };
}

export async function allocateFifo(requiredKg, session) {
  const batches = await PurchaseBatch.find({
    status: "available",
    remainingQuantityKg: { $gt: 0 },
  })
    .sort({ batchDate: 1, createdAt: 1 })
    .session(session);
  const availableKg = round(
    batches.reduce((sum, batch) => sum + batch.remainingQuantityKg, 0),
    3,
  );
  if (availableKg < requiredKg)
    return {
      insufficient: true,
      availableKg,
      shortageKg: round(requiredKg - availableKg, 3),
    };
  let remaining = requiredKg;
  const allocations = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const quantityKg = round(Math.min(remaining, batch.remainingQuantityKg), 3);
    batch.remainingQuantityKg = round(
      batch.remainingQuantityKg - quantityKg,
      3,
    );
    batch.status = batch.remainingQuantityKg <= 0 ? "exhausted" : "available";
    await batch.save({ session });
    allocations.push({
      batch,
      quantityKg,
      costPerKg: batch.acquisitionCostPerKg || batch.purchaseCostPerKg,
      totalCost: round(
        quantityKg * (batch.acquisitionCostPerKg || batch.purchaseCostPerKg),
        2,
      ),
    });
    remaining = round(remaining - quantityKg, 3);
  }
  return {
    allocations,
    totalCost: round(
      allocations.reduce((sum, item) => sum + item.totalCost, 0),
      2,
    ),
    availableKg,
  };
}
