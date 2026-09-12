import test from "node:test";
import assert from "node:assert/strict";
import { resolveResource } from "../src/controllers/coreController.js";
import { StaffMember } from "../src/models/index.js";

test("resolveResource handles top-level resource routes like /suppliers", () => {
  const req = { path: "/suppliers", params: {} };
  assert.equal(resolveResource(req), "suppliers");
});

test("resolveResource prefers explicit params.resource when present", () => {
  const req = { path: "/suppliers/123", params: { resource: "suppliers" } };
  assert.equal(resolveResource(req), "suppliers");
});

test("StaffMember stores a fixed monthly salary for employees", () => {
  assert.ok(StaffMember.schema.path("monthlySalary"));

  const person = new StaffMember({
    name: "Jane Doe",
    isEmployee: true,
    monthlySalary: 4500,
    createdBy: "507f1f77bcf86cd799439011",
  });

  assert.equal(person.monthlySalary, 4500);
});
