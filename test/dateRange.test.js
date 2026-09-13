import test from "node:test";
import assert from "node:assert/strict";

import { dateRange } from "../src/utils/dateRange.js";

test("date-only ranges include the full calendar day", () => {
  const boundaries = dateRange("2026-09-14", "2026-09-14");

  assert.equal(boundaries.$gte.toISOString(), "2026-09-14T00:00:00.000Z");
  assert.equal(boundaries.$lte.toISOString(), "2026-09-14T23:59:59.999Z");
});
