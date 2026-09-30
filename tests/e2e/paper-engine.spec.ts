import { expect, test } from "@playwright/test";
import { paperEngineIntent, paperOrderQuantity } from "../../lib/paper/auto-engine";

test("paper engine sizes virtual orders from shadow notionals", () => {
  expect(paperOrderQuantity(2_500, 0.74)).toBe(3378);
  expect(paperOrderQuantity(10, 25)).toBe(0);
  expect(paperOrderQuantity(Number.NaN, 10)).toBe(0);
});

test("paper engine buys shadow watches and sells exits without a broker key", () => {
  const buy = paperEngineIntent({
    symbol: "ACTU",
    opportunityId: "3cfdbe5b-cfd6-4327-8060-9f234dc8cd2d",
    action: "WATCH",
    notional: 1_000,
    price: 0.74,
  });
  expect(buy?.side).toBe("buy");
  expect(buy?.quantity).toBe(1351);
  expect(buy?.idempotencyKey.startsWith("paper-engine.")).toBe(true);

  const exit = paperEngineIntent({
    symbol: "ACTU",
    opportunityId: "3cfdbe5b-cfd6-4327-8060-9f234dc8cd2d",
    action: "EXIT",
    notional: 1_000,
    price: 0.74,
    heldQty: 10.9,
  });
  expect(exit?.side).toBe("sell");
  expect(exit?.quantity).toBe(10);

  expect(paperEngineIntent({
    symbol: "ACTU",
    opportunityId: "3cfdbe5b-cfd6-4327-8060-9f234dc8cd2d",
    action: "BLOCK",
    notional: 1_000,
    price: 0.74,
  })).toBeNull();
});
