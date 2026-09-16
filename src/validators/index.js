import { z } from "zod";
export const id = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
export const purchaseInput = z
  .object({
    supplier: id,
    quantityTon: z.number().positive().optional(),
    quantityKg: z.number().positive().optional(),
    purchaseRatePerKg: z.number().positive(),
    additionalCost: z.number().nonnegative().default(0),
    purchaseDate: z.coerce.date().optional(),
    totalPaid: z.number().nonnegative().default(0),
    notes: z.string().optional(),
  })
  .superRefine((input, context) => {
    if (input.quantityKg === undefined && input.quantityTon === undefined) {
      context.addIssue({
        code: "custom",
        message: "Provide either quantityKg or quantityTon",
        path: ["quantityKg"],
      });
    }
    if (input.quantityKg !== undefined && input.quantityTon !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Provide only one of quantityKg or quantityTon",
        path: ["quantityKg"],
      });
    }
  });
export const saleInput = z.object({
  customer: id,
  items: z
    .array(
      z.object({
        cylinderType: id,
        cylinderCount: z.number().int().positive(),
        pricePerCylinder: z.number().positive(),
      }),
    )
    .min(1),
  discount: z.number().nonnegative().default(0),
  totalPaid: z.number().nonnegative().default(0),
  saleDate: z.coerce.date().optional(),
});
export const paymentInput = z.object({
  amount: z.number().positive(),
  paymentType: z.enum(["sale", "advance"]).optional(),
  paymentDate: z.coerce.date().optional(),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  customer: id.optional(),
  supplier: id.optional(),
  sale: id.optional(),
  purchase: id.optional(),
});
export const stockAdjustmentInput = z.object({
  type: z.enum(["ADJUSTMENT_IN", "ADJUSTMENT_OUT"]),
  quantityKg: z.number().positive(),
  batch: id,
  reason: z.string().min(1),
  notes: z.string().optional(),
});
